# SOTA Projects

Showcase AI products, apps and tools on **SOTA**, and help improve the collection. Commercial products and open-source projects are both welcome.

**[Suggest a project](https://github.com/sotacc/sota-projects/issues/new?template=project.yml)** · **[View an example](examples/project-submission.md)** · **[Browse submissions](https://github.com/sotacc/sota-projects/issues)** · **[Share feedback](https://github.com/sotacc/sota-projects/issues/new)**

## Suggest a project

Open a **[Project]** Issue using the submission template. Tell us:

- The product name and official website. A public GitHub repository is optional; repository-only submissions are also supported.
- What the project does and who it helps.
- Why it is worth including, with supporting links.
- Optionally, a direct HTTPS link to its official logo (PNG, JPEG or WebP, up to 2 MB). Leave it blank for a default icon, or the GitHub repository owner’s avatar when available.
- Optionally, its documentation, demo, X profile, Discord, or other project links.

Check existing Issues first. To add information or correct a submission, edit the original Issue instead of creating a duplicate. Submissions and discussions are public; leave out private information.

Logos are reviewed and stored with the website before publication. You do not need to upload an image file or open a pull request in this repository.

## Example submissions

See the [website-only product example](examples/website-only-submission.md) for a product with no public source code. It is fictional and is not a live submission.

Read the [LangChain submission example](examples/project-submission.md) to see a completed submission, including official project links and supporting evidence. LangChain is already listed; the file is a writing guide, not a new submission. Use the **Suggest a project** button for a different project.

You do not need to clone this repository, edit files, or open a pull request to suggest a project.

## Where submissions are stored

| Stage | Where the data lives |
| --- | --- |
| Preparing a draft on the website | In your browser until you create the GitHub Issue |
| Submitted | The public Issue body in this repository; comments and labels track discussion and review |
| Approved for import | A draft JSON file at `content/projects/<slug>.json`, plus source records, in a draft PR in the maintainer's private website repository |
| Reviewed and published | The reviewed JSON remains in the website repository; its published content is built into static pages served by Cloudflare Workers |

**The Issues tab is the submission inbox.** A submission does not create a file in this repository, and cloning the repository does not download its Issues. Edit your original Issue to correct or add information. Once a draft has been imported, edits to the Issue require maintainer review and an update to that draft; they do not silently overwrite catalog data.

## What happens next

1. Automated checks validate the required fields, links, and public repository metadata when a repository is provided. Submitted websites are not automatically fetched.
2. A maintainer assesses the project's purpose, evidence, and fit for the collection.
3. Accepted candidates enter editorial review. Once a project is reviewed, published, and confirmed on the live site, its Issue receives a link and is closed.

Passing automated checks does not guarantee inclusion. Checks do not execute submitted code or verify project claims. Official project links and third-party evidence are reviewed separately.

## Corrections and feedback

Open an Issue describing the affected project and the correction or suggestion. Project submissions belong in Issues, rather than code pull requests. This repository is the community intake for SOTA; it is not a downloadable catalog dataset.

Browse the collection at **[sota.cc](https://sota.cc/)**. Accepted submissions remain open until editorial review and deployment are complete. Publication acknowledgements are currently handled by maintainers.

## What are these directories for?

| Directory | Purpose |
| --- | --- |
| `.github/ISSUE_TEMPLATE/` | The form shown when you suggest a project on GitHub |
| `.github/workflows/` | Runs automated checks when a project Issue is opened, edited, or reopened |
| `scripts/submissions/` | Reads the Issue and repository metadata, then posts or updates check feedback |
| `src/lib/` | Shared validation rules for submission fields and project links; this is not a website frontend |
| `config/` | The submission repository name and its public catalog origin |
| `examples/` | Documentation samples only; these are not live submissions or the project dataset |

GitHub Issues can receive submissions without these code directories. They are included to provide the current automated checks: the workflow imports the scripts, shared validation modules, and configuration. Keep them together if those checks are enabled. Contributors only need the submission form and Issues tab.

### Optional product details

Start at [sota.cc/submit](https://sota.cc/submit/) with a product URL for an AI draft, or supply a name and summary yourself. Problem, audience, usefulness and documented limitations are optional, editable suggestions. The full Markdown draft includes these sections and the importer preserves them for review. Supporting sources default to the website or repository. Legacy Issue headings remain supported. Submission text does not grant publication approval.
