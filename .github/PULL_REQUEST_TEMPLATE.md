## Pull Request Title
<!-- Provide a concise and descriptive title for the pull request -->
fix: Harden resume improvement prompt to prevent AI hallucination

## Related Issue
<!-- If this pull request is related to an issue, please link it here using the "#" symbol followed by the issue number (e.g., #123) -->
- Issue number : #307

## Description
<!-- Describe the changes made in this pull request. What problem does it solve or what feature does it add/modify? -->
This PR addresses a critical issue with AI hallucination in the resume improvement feature where the model would fabricate details not present in the user's original resume. The prompt in `resume_improvement.py` has been completely overhauled with explicit anti-fabrication directives and a structured reasoning framework to ensure all output is truthful and grounded solely in the provided user data.

## Type
<!-- Check the relevant options by putting an "x" in the brackets -->

- [x] Bug Fix
- [ ] Feature Enhancement
- [ ] Documentation Update
- [x] Code Refactoring
- [ ] Other (please specify):

## Proposed Changes
<!-- List the specific changes made in this pull request -->

- Completely revamped the prompt in `apps/backend/app/prompt/resume_improvement.py`
- Added explicit anti-hallucination directives forbidding invention of details
- Implemented structured "Analyze then Revise" framework for better AI reasoning
- Enhanced quantification handling with placeholder usage for implied metrics
- Strengthened output formatting rules for consistent parsing


## Screenshots / Code Snippets (if applicable)
<!-- Include any relevant screenshots or code snippets that help visualize the changes made -->

## How to Test
<!-- Provide step-by-step instructions or a checklist for testing the changes in this pull request -->

- Do a general tool run and feed the data. You'll witness the effect of the modified prompt.

## Checklist
<!-- Put an "x" in the brackets for the items that apply to this pull request -->

- [x] The code compiles successfully without any errors or warnings
- [x] The changes have been tested and verified
- [ ] The documentation has been updated (if applicable)
- [x] The changes follow the project's coding guidelines and best practices
- [x] The commit messages are descriptive and follow the project's guidelines
- [x] All tests (if applicable) pass successfully
- [x] This pull request has been linked to the related issue (if applicable)

## Additional Information
<!-- Add any other information about the pull request that you think might be helpful -->
This change is critical for maintaining user trust and ensuring the resume improvement feature provides truthful, accurate enhancements rather than fabricated content. The new prompt structure can serve as a template for other AI-powered features that require similar constraints against hallucination.
