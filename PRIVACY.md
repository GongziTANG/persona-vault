# Privacy and data boundaries

PersonaVault archives can contain sensitive personal or copyrighted material even when the source was publicly reachable. Treat every runtime vault as private by default.

## Never commit

- authentication sessions, cookies, tokens, QR codes, or browser profiles;
- target account archives or generated vaults;
- real account IDs, private URLs, local absolute paths, or personal contact details;
- screenshots or fixtures copied from a real person's archive;
- unpublished, access-controlled, or private content.

The repository ignores common runtime locations, but `.gitignore` is not a security boundary. Run `npm run privacy`, inspect `git diff --cached`, and verify the staged file list before every push.

## Safe fixtures

Use fictional identities, reserved domains such as `example.invalid`, fabricated IDs, and short original text written specifically for the test. Do not “anonymize” real content by changing only the name; distinctive prose can still identify its author.

## Local runtime

Keep connector sessions in their connector-managed private state. PersonaVault imports normalized local artifacts and never needs credentials in `vault.json`. Do not publish a generated vault unless every content owner and data subject has been considered.

## Vulnerability reports

Use the repository's private security-advisory feature for vulnerabilities that could expose sessions, credentials, private archives, or local paths. Do not open a public issue containing secrets or personal data.
