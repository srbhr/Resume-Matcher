"""A resume's photo: its own resource, never in resume JSON, copied with the resume."""

import io
from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from app.database import Database
from app.main import app
from app.services.resume_photo import MAX_PHOTO_BYTES

JPEG_PREFIX = "data:image/jpeg;base64,"


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


def image_bytes(fmt: str = "PNG", color: str = "navy") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (700, 900), color).save(buffer, format=fmt)
    return buffer.getvalue()


async def upload(
    client: AsyncClient, resume_id: str, data: bytes, name: str = "me.png"
) -> Any:
    return await client.put(
        f"/api/v1/resumes/{resume_id}/photo",
        files={"file": (name, data, "application/octet-stream")},
    )


async def ready_master(db: Database, name: str = "Ada") -> dict[str, Any]:
    return await db.create_resume_atomic_master(
        content=name,
        processing_status="ready",
        processed_data={"personalInfo": {"name": name}, "summary": name},
    )


async def test_an_uploaded_photo_is_stored_and_read_back(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await ready_master(isolated_db)

    stored = await upload(client, resume["resume_id"], image_bytes())

    assert stored.status_code == 200, stored.text
    photo = stored.json()["photo"]
    assert photo.startswith(JPEG_PREFIX)
    read = await client.get(f"/api/v1/resumes/{resume['resume_id']}/photo")
    assert read.json() == {"photo": photo}


async def test_a_resume_without_a_photo_reads_null(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await ready_master(isolated_db)

    read = await client.get(f"/api/v1/resumes/{resume['resume_id']}/photo")

    assert (read.status_code, read.json()) == (200, {"photo": None})


@pytest.mark.parametrize("method", ["get", "put", "delete"])
async def test_an_unknown_resume_is_404(client: AsyncClient, method: str) -> None:
    url = "/api/v1/resumes/no-such-resume/photo"
    if method == "put":
        response = await upload(client, "no-such-resume", image_bytes())
    else:
        response = await getattr(client, method)(url)

    assert response.status_code == 404


async def test_a_file_that_is_not_a_photo_is_422_and_keeps_the_old_photo(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await ready_master(isolated_db)
    first = (await upload(client, resume["resume_id"], image_bytes())).json()["photo"]

    refused = await upload(client, resume["resume_id"], b"%PDF-1.7 not a photo")

    assert refused.status_code == 422
    assert refused.json()["detail"] == "Upload a JPEG, PNG or WebP photo."
    assert await isolated_db.get_resume_photo(resume["resume_id"]) == first


async def test_a_file_over_the_limit_is_413(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await ready_master(isolated_db)

    refused = await upload(client, resume["resume_id"], b"\xff" * (MAX_PHOTO_BYTES + 1))

    assert refused.status_code == 413
    assert await isolated_db.get_resume_photo(resume["resume_id"]) is None


async def test_removing_the_photo_twice_is_fine(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await ready_master(isolated_db)
    await upload(client, resume["resume_id"], image_bytes())

    for _ in range(2):
        removed = await client.delete(f"/api/v1/resumes/{resume['resume_id']}/photo")
        assert (removed.status_code, removed.json()) == (200, {"photo": None})
    assert await isolated_db.get_resume_photo(resume["resume_id"]) is None


async def test_the_photo_stays_out_of_resume_json(
    client: AsyncClient, isolated_db: Database
) -> None:
    # Resume JSON goes into LLM prompts, MCP tool results and CLI output.
    resume = await ready_master(isolated_db)
    await upload(client, resume["resume_id"], image_bytes())

    fetched = await client.get(
        "/api/v1/resumes", params={"resume_id": resume["resume_id"]}
    )
    row = await isolated_db.get_resume(resume["resume_id"])

    assert "photo" not in fetched.json()["data"]
    assert JPEG_PREFIX not in fetched.text
    assert row is not None and "photo" not in row
    assert JPEG_PREFIX not in str(row)


async def test_a_tailored_resume_starts_with_its_masters_photo(
    isolated_db: Database,
) -> None:
    master = await ready_master(isolated_db)
    await isolated_db.set_resume_photo(master["resume_id"], JPEG_PREFIX + "master")
    job = await isolated_db.create_job("Synthetic job")

    tailored = await isolated_db.create_tailored_resume(
        request_id="r1",
        original_resume_id=master["resume_id"],
        job_id=job["job_id"],
        resume_fields={"content": "{}", "parent_id": master["resume_id"]},
        improvements=[],
    )

    assert (
        await isolated_db.get_resume_photo(tailored["resume_id"])
        == JPEG_PREFIX + "master"
    )


async def test_a_duplicate_keeps_the_copied_resumes_own_photo(
    client: AsyncClient, isolated_db: Database
) -> None:
    # The tailored resume dropped the master's photo (say, for a UK job): its copy
    # must not get the master's photo back.
    master = await ready_master(isolated_db)
    await isolated_db.set_resume_photo(master["resume_id"], JPEG_PREFIX + "master")
    job = await isolated_db.create_job("Synthetic job")
    tailored = await isolated_db.create_tailored_resume(
        request_id="r1",
        original_resume_id=master["resume_id"],
        job_id=job["job_id"],
        resume_fields={
            "content": "{}",
            "parent_id": master["resume_id"],
            "processing_status": "ready",
            "processed_data": {"personalInfo": {"name": "Ada"}},
        },
        improvements=[],
    )
    await client.delete(f"/api/v1/resumes/{tailored['resume_id']}/photo")

    copied = await client.post(f"/api/v1/resumes/{tailored['resume_id']}/duplicate")
    master_copy = await client.post(f"/api/v1/resumes/{master['resume_id']}/duplicate")

    assert copied.status_code == 201, copied.text
    assert await isolated_db.get_resume_photo(copied.json()["resume_id"]) is None
    assert master_copy.status_code == 201, master_copy.text
    assert (
        await isolated_db.get_resume_photo(master_copy.json()["resume_id"])
        == JPEG_PREFIX + "master"
    )
