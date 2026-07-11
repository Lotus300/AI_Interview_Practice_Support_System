#!/usr/bin/env sh
set -eu

# Stage additions, modifications, deletions, and file moves.
# This is required after moving mock files into prototype/screen-mock
# and deleting duplicated backend files.
git add -A

printf "\nStaged changes:\n"
git diff --cached --name-status

printf "\nWorking tree status:\n"
git status --short
