# ElevenLabs Showcase submission

The ElevenLabs prize requires a pull request to [`elevenlabs/showcase`](https://github.com/elevenlabs/showcase). This folder holds drafts of the files that go into that repo. Nothing here is used by the app.

Owner: the Voice slice owner. Deadline: before project submission, about 11:30 AM Sunday Oct 11.

## Before submitting

- [ ] The voice assistant works end to end. Reread `projects/ruconnect.mdx` and remove or reword anything that was not built: it was drafted from the design, before the feature existed.
- [ ] Each person renames their file in `authors/` to `their-full-name.yml` and fills in every `FILL IN`.
- [ ] `authorIds` in `projects/ruconnect.mdx` match the renamed author files (without `.yml`).
- [ ] Cover image made: 1200x630, PNG or JPG, named `ruconnect.png`.
- [ ] `demoUrl` or `videoUrl` added to the front matter of `projects/ruconnect.mdx`, and the Demo section filled in.
- [ ] `date` in the front matter is the submission date.
- [ ] `description` is 160 characters or fewer.

## Submitting

1. Fork `elevenlabs/showcase` and clone **your fork** (their guide's clone command points at their repo, which you cannot push to):
   `gh repo fork elevenlabs/showcase --clone && cd showcase`
2. Copy `authors/*.yml` into the fork's `/authors/` and `projects/ruconnect.mdx` into its `/projects/`.
3. Add the cover image. Their guide names two locations (`/public/images/` and `/projects/images/`); look at where an existing project such as `gibberlink` keeps its image and what its `image:` field says, and match that.
4. Commit as `Add RUConnect to showcase`, push, and open a pull request to `elevenlabs/showcase`.
5. In the pull request description include: a short summary, the demo or video link, a statement that we have the rights to share the project, and an X handle for the announcement.

## Requirements this project already meets

- Uses ElevenLabs technology (Conversational AI agent), once the voice slice is built.
- Open source and free to use: public repo, MIT license.
