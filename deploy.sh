#!/usr/bin/env sh

# abort on errors
set -e

# build
npm run build

# navigate into the build output directory
cd dist

# TODO: CNAME HERE
# echo 'website.biz' > CNAME

# push to gh-pages branch
git init
git add -A
git commit -m 'deploy github pages'
git push -f git@github.com:jaames/baba-levels.git master:gh-pages

cd -