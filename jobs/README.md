# jobs/

Save job descriptions here for your coding agent, one per file (`.md` or `.txt`), then ask it:

> Tailor my resume for every job in jobs/.

Each job becomes a tailored resume on the dashboard at <http://localhost:3000>. Finished files move to `jobs/done/`, so running it again only picks up new ones. The agent keeps its working files in `jobs/.work/`.

Everything in this folder except this README is gitignored, so your job descriptions stay on your machine.

Setup: [SETUP.md](../SETUP.md#use-resume-matcher-with-a-coding-agent).
