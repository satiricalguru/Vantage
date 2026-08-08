# Project Rules & Customizations

## Execution Policy
- **Never ask the user to execute manual terminal steps, build commands, or git pushes.**
- The assistant is fully empowered to execute all git commits, git pushes, builds, test passes, and environment cleanups directly.
- If an environment variable (such as `GITHUB_TOKEN`) causes git authentication to fail, bypass it using `env -u GITHUB_TOKEN git push origin main` or standard credential helpers autonomously.
