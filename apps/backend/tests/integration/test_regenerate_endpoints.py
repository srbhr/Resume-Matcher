import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.routers import enrichment as enrichment_router
from app.schemas.enrichment import RegenerateItemInput, RegenerateRequest, RegeneratedItem


class TestRegenerateSchemas(unittest.TestCase):
    def test_regenerate_request_instruction_max_length(self) -> None:
        item = RegenerateItemInput(
            item_id="skills",
            item_type="skills",
            title="Skills",
            current_content=["Python"],
        )

        RegenerateRequest(
            resume_id="resume_1",
            items=[item],
            instruction="x" * 2000,
            output_language="en",
        )

        with self.assertRaises(ValidationError):
            RegenerateRequest(
                resume_id="resume_1",
                items=[item],
                instruction="x" * 2001,
                output_language="en",
            )


class TestRegenerateEndpoints(unittest.IsolatedAsyncioTestCase):
    async def test_regenerate_processes_multiple_items_in_parallel(self) -> None:
        resume_id = "resume_1"
        request = RegenerateRequest(
            resume_id=resume_id,
            items=[
                RegenerateItemInput(
                    item_id="exp_0",
                    item_type="experience",
                    title="Senior Software Engineer",
                    subtitle="Google",
                    current_content=["Old"],
                ),
                RegenerateItemInput(
                    item_id="skills",
                    item_type="skills",
                    title="Technical Skills",
                    current_content=["Python"],
                ),
            ],
            instruction="Improve wording",
            output_language="en",
        )

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": {"workExperience": [], "additional": {}}}

        exp_item = RegeneratedItem(
            item_id="exp_0",
            item_type="experience",
            title="Senior Software Engineer",
            subtitle="Google",
            original_content=["Old"],
            new_content=["New"],
            diff_summary="Summary",
        )
        skills_item = RegeneratedItem(
            item_id="skills",
            item_type="skills",
            title="Technical Skills",
            original_content=["Python"],
            new_content=["Python", "TypeScript"],
            diff_summary="Summary",
        )

        with (
            patch.object(enrichment_router, "db", mock_db),
            patch.object(
                enrichment_router,
                "_regenerate_experience_or_project",
                AsyncMock(return_value=exp_item),
            ) as mock_regenerate_item,
            patch.object(
                enrichment_router,
                "_regenerate_skills",
                AsyncMock(return_value=skills_item),
            ) as mock_regenerate_skills,
        ):
            response = await enrichment_router.regenerate_items(request)

        self.assertEqual(
            [item.item_id for item in response.regenerated_items],
            ["exp_0", "skills"],
        )
        mock_regenerate_item.assert_awaited()
        mock_regenerate_skills.assert_awaited()

    async def test_regenerate_allows_partial_success_with_errors(self) -> None:
        resume_id = "resume_1"
        request = RegenerateRequest(
            resume_id=resume_id,
            items=[
                RegenerateItemInput(
                    item_id="exp_0",
                    item_type="experience",
                    title="Senior Software Engineer",
                    subtitle="Google",
                    current_content=["Old"],
                ),
                RegenerateItemInput(
                    item_id="skills",
                    item_type="skills",
                    title="Technical Skills",
                    current_content=["Python"],
                ),
            ],
            instruction="Improve wording",
            output_language="en",
        )

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": {"workExperience": [], "additional": {}}}

        skills_item = RegeneratedItem(
            item_id="skills",
            item_type="skills",
            title="Technical Skills",
            original_content=["Python"],
            new_content=["Python", "TypeScript"],
            diff_summary="Summary",
        )

        with (
            patch.object(enrichment_router, "db", mock_db),
            patch.object(
                enrichment_router,
                "_regenerate_experience_or_project",
                AsyncMock(side_effect=RuntimeError("boom")),
            ),
            patch.object(
                enrichment_router,
                "_regenerate_skills",
                AsyncMock(return_value=skills_item),
            ),
        ):
            response = await enrichment_router.regenerate_items(request)

        self.assertEqual([item.item_id for item in response.regenerated_items], ["skills"])
        self.assertEqual([err.item_id for err in response.errors], ["exp_0"])

    async def test_regenerate_routes_summary_through_item_prompt_path(self) -> None:
        resume_id = "resume_1"
        request = RegenerateRequest(
            resume_id=resume_id,
            items=[
                RegenerateItemInput(
                    item_id="summary",
                    item_type="summary",
                    title="Professional Summary",
                    current_content=["Backend engineer with API and cloud experience."],
                )
            ],
            instruction="Make this more concise and results-oriented",
            output_language="en",
        )

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": {"summary": "Old summary"}}

        summary_item = RegeneratedItem(
            item_id="summary",
            item_type="summary",
            title="Professional Summary",
            original_content=["Backend engineer with API and cloud experience."],
            new_content=["Results-driven backend engineer with cloud API expertise."],
            diff_summary="Made the summary more concise.",
        )

        with (
            patch.object(enrichment_router, "db", mock_db),
            patch.object(
                enrichment_router,
                "_regenerate_summary",
                AsyncMock(return_value=summary_item),
            ) as mock_regenerate_summary,
        ):
            response = await enrichment_router.regenerate_items(request)

        self.assertEqual([item.item_id for item in response.regenerated_items], ["summary"])
        mock_regenerate_summary.assert_awaited_once()

    async def test_apply_regenerated_falls_back_to_metadata_matching(self) -> None:
        resume_id = "resume_1"
        processed_data = {
            "workExperience": [
                {
                    "title": "Some Other Role",
                    "company": "OtherCo",
                    "description": ["Keep me"],
                },
                {
                    "title": "Senior Software Engineer",
                    "company": "Google",
                    "description": ["Old bullet"],
                },
            ],
            "personalProjects": [],
            "additional": {"technicalSkills": ["Python"]},
        }

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": processed_data}
        mock_db.update_resume.return_value = None

        regenerated_items = [
            RegeneratedItem(
                item_id="exp_0",  # stale index: exp_0 no longer points to the matching entry
                item_type="experience",
                title="Senior Software Engineer",
                subtitle="Google",
                original_content=["Old bullet"],
                new_content=["New bullet"],
                diff_summary="Summary",
            )
        ]

        with patch.object(enrichment_router, "db", mock_db):
            result = await enrichment_router.apply_regenerated_items(resume_id, regenerated_items)

        self.assertEqual(result["updated_items"], 1)

        update_payload = mock_db.update_resume.call_args.args[1]
        updated = update_payload["processed_data"]

        self.assertEqual(updated["workExperience"][0]["description"], ["Keep me"])
        self.assertEqual(updated["workExperience"][1]["description"], ["New bullet"])

    async def test_apply_regenerated_disambiguates_duplicates_by_original_content(self) -> None:
        resume_id = "resume_1"
        processed_data = {
            "workExperience": [
                {"title": "Engineer", "company": "Google", "description": ["Bullet A"]},
                {"title": "Engineer", "company": "Google", "description": ["Bullet B"]},
            ],
            "personalProjects": [],
            "additional": {"technicalSkills": ["Python"]},
        }

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": processed_data}
        mock_db.update_resume.return_value = None

        regenerated_items = [
            RegeneratedItem(
                item_id="exp_0",  # could point to a different duplicate after reordering
                item_type="experience",
                title="Engineer",
                subtitle="Google",
                original_content=["Bullet B"],
                new_content=["Bullet B (rewritten)"],
                diff_summary="Summary",
            )
        ]

        with patch.object(enrichment_router, "db", mock_db):
            result = await enrichment_router.apply_regenerated_items(resume_id, regenerated_items)

        self.assertEqual(result["updated_items"], 1)

        updated = mock_db.update_resume.call_args.args[1]["processed_data"]
        self.assertEqual(updated["workExperience"][0]["description"], ["Bullet A"])
        self.assertEqual(updated["workExperience"][1]["description"], ["Bullet B (rewritten)"])

    async def test_apply_regenerated_refuses_when_items_do_not_match(self) -> None:
        resume_id = "resume_1"
        processed_data = {
            "workExperience": [
                {"title": "Engineer", "company": "Acme", "description": ["Old"]},
            ],
            "personalProjects": [],
            "additional": {"technicalSkills": ["Python"]},
        }

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": processed_data}

        regenerated_items = [
            RegeneratedItem(
                item_id="exp_0",
                item_type="experience",
                title="Different Title",
                subtitle="Different Co",
                original_content=["Old"],
                new_content=["New"],
                diff_summary="Summary",
            )
        ]

        with patch.object(enrichment_router, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await enrichment_router.apply_regenerated_items(resume_id, regenerated_items)

        self.assertEqual(ctx.exception.status_code, 409)
        mock_db.update_resume.assert_not_called()

    async def test_apply_regenerated_updates_skills_for_additional_and_legacy_paths(self) -> None:
        resume_id = "resume_1"

        base_item = RegeneratedItem(
            item_id="skills",
            item_type="skills",
            title="Technical Skills",
            original_content=["Python"],
            new_content=["Python", "TypeScript"],
            diff_summary="Summary",
        )

        # additional.technicalSkills path
        mock_db_additional = MagicMock()
        mock_db_additional.get_resume.return_value = {
            "processed_data": {"additional": {"technicalSkills": ["Python"]}}
        }
        mock_db_additional.update_resume.return_value = None

        with patch.object(enrichment_router, "db", mock_db_additional):
            result = await enrichment_router.apply_regenerated_items(resume_id, [base_item])

        self.assertEqual(result["updated_items"], 1)
        updated = mock_db_additional.update_resume.call_args.args[1]["processed_data"]
        self.assertEqual(updated["additional"]["technicalSkills"], ["Python", "TypeScript"])

        # legacy technicalSkills path
        mock_db_legacy = MagicMock()
        mock_db_legacy.get_resume.return_value = {"processed_data": {"technicalSkills": ["Python"]}}
        mock_db_legacy.update_resume.return_value = None

        with patch.object(enrichment_router, "db", mock_db_legacy):
            result = await enrichment_router.apply_regenerated_items(resume_id, [base_item])

        self.assertEqual(result["updated_items"], 1)
        updated = mock_db_legacy.update_resume.call_args.args[1]["processed_data"]
        self.assertEqual(updated["technicalSkills"], ["Python", "TypeScript"])

    async def test_apply_regenerated_skills_fails_when_no_supported_path_exists(self) -> None:
        resume_id = "resume_1"

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": {"workExperience": []}}

        regenerated_items = [
            RegeneratedItem(
                item_id="skills",
                item_type="skills",
                title="Technical Skills",
                original_content=["Python"],
                new_content=["Python", "TypeScript"],
                diff_summary="Summary",
            )
        ]

        with patch.object(enrichment_router, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await enrichment_router.apply_regenerated_items(resume_id, regenerated_items)

        self.assertEqual(ctx.exception.status_code, 409)
        mock_db.update_resume.assert_not_called()

    async def test_apply_regenerated_updates_summary_when_original_matches(self) -> None:
        resume_id = "resume_1"
        processed_data = {
            "summary": "Backend engineer with 8 years of experience.",
            "workExperience": [],
            "personalProjects": [],
            "additional": {"technicalSkills": ["Python"]},
        }

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": processed_data}
        mock_db.update_resume.return_value = None

        regenerated_items = [
            RegeneratedItem(
                item_id="summary",
                item_type="summary",
                title="Professional Summary",
                original_content=["Backend engineer with 8 years of experience."],
                new_content=[
                    "Results-driven backend engineer with 8 years of experience building APIs."
                ],
                diff_summary="Refined positioning and clarity.",
            )
        ]

        with patch.object(enrichment_router, "db", mock_db):
            result = await enrichment_router.apply_regenerated_items(resume_id, regenerated_items)

        self.assertEqual(result["updated_items"], 1)
        updated = mock_db.update_resume.call_args.args[1]["processed_data"]
        self.assertEqual(
            updated["summary"],
            "Results-driven backend engineer with 8 years of experience building APIs.",
        )

    async def test_apply_regenerated_collapses_multiline_summary_to_paragraph(self) -> None:
        resume_id = "resume_1"
        processed_data = {
            "summary": "Backend engineer with 8 years of experience.",
            "workExperience": [],
            "personalProjects": [],
            "additional": {"technicalSkills": ["Python"]},
        }

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": processed_data}
        mock_db.update_resume.return_value = None

        regenerated_items = [
            RegeneratedItem(
                item_id="summary",
                item_type="summary",
                title="Professional Summary",
                original_content=["Backend engineer with 8 years of experience."],
                new_content=[
                    "Results-driven backend engineer.",
                    "Eight years building scalable APIs.",
                ],
                diff_summary="Refined positioning and clarity.",
            )
        ]

        with patch.object(enrichment_router, "db", mock_db):
            result = await enrichment_router.apply_regenerated_items(resume_id, regenerated_items)

        self.assertEqual(result["updated_items"], 1)
        updated = mock_db.update_resume.call_args.args[1]["processed_data"]
        self.assertEqual(
            updated["summary"],
            "Results-driven backend engineer. Eight years building scalable APIs.",
        )

    async def test_apply_regenerated_summary_mismatch_returns_409(self) -> None:
        resume_id = "resume_1"
        processed_data = {
            "summary": "Updated summary already changed by user.",
            "workExperience": [],
            "personalProjects": [],
            "additional": {"technicalSkills": ["Python"]},
        }

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": processed_data}

        regenerated_items = [
            RegeneratedItem(
                item_id="summary",
                item_type="summary",
                title="Professional Summary",
                original_content=["Old summary from stale preview."],
                new_content=["New summary candidate."],
                diff_summary="Updated tone.",
            )
        ]

        with patch.object(enrichment_router, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await enrichment_router.apply_regenerated_items(resume_id, regenerated_items)

        self.assertEqual(ctx.exception.status_code, 409)
        mock_db.update_resume.assert_not_called()

    async def test_apply_regenerated_is_atomic_when_summary_fails(self) -> None:
        resume_id = "resume_1"
        processed_data = {
            "summary": "Current summary in resume.",
            "workExperience": [
                {"title": "Engineer", "company": "Acme", "description": ["Old bullet"]},
            ],
            "personalProjects": [],
            "additional": {"technicalSkills": ["Python"]},
        }

        mock_db = MagicMock()
        mock_db.get_resume.return_value = {"processed_data": processed_data}

        regenerated_items = [
            RegeneratedItem(
                item_id="exp_0",
                item_type="experience",
                title="Engineer",
                subtitle="Acme",
                original_content=["Old bullet"],
                new_content=["New bullet"],
                diff_summary="Refined bullet.",
            ),
            RegeneratedItem(
                item_id="summary",
                item_type="summary",
                title="Professional Summary",
                original_content=["Stale summary from old preview."],
                new_content=["Candidate summary update."],
                diff_summary="Refined summary.",
            ),
        ]

        with patch.object(enrichment_router, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await enrichment_router.apply_regenerated_items(resume_id, regenerated_items)

        self.assertEqual(ctx.exception.status_code, 409)
        mock_db.update_resume.assert_not_called()
