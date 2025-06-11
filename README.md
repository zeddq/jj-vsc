# jj-vsc

VS Code integration for the [JuJutsu](https://github.com/martinvonz/jj) version control system. The extension exposes common JJ commands through the Source Control view and the command palette.

## Features

- Status view showing changed, added, deleted and moved files
- Commit changes directly from the Source Control view
- View working copy diffs and commit history
- Merge branches from the command palette
- Refresh repository status on demand or automatically when files are saved

## Usage

1. Open a workspace that contains a `.jj` directory.
2. The extension activates automatically and the *JuJutsu* source control provider becomes available.
3. Use the commands listed under **JuJutsu:** in the command palette to interact with the repository.

## Building and Testing

```bash
npm install            # install dependencies
npm run compile        # build the extension
npm test               # run the test suite
```

During development you can run `npm run watch` to rebuild on file changes.

## Configuration Options

The extension contributes the following settings under the `jj-vsc` namespace:

- `jj-vsc.enableAutoFetch` – boolean, defaults to `true`. Enable automatic fetching of changes.
- `jj-vsc.defaultCommitMessage` – string, default empty. Template used for new commit messages.
- `jj-vsc.showStatusBar` – boolean, defaults to `true`. Show status bar information when a JJ repository is detected.

## Known Issues

- JuJutsu must be installed and available on the system `PATH`.
- Some features rely on JJ commands that are not yet implemented (e.g. retrieving the previous version of a file).

## Release Notes

See [CHANGELOG.mda](CHANGELOG.mda) for the list of changes.

---

*Following the [extension guidelines](https://code.visualstudio.com/api/references/extension-guidelines).* 
