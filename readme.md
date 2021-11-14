# Baba Levels

Browse user-created levels from the new [Baba Is You](https://hempuli.com/baba/) level editor update, on the web!

This is a simple proof of concept I made in a day, so it isn't terribly fleshed out. If there's enough interest I may look into adding [more features](#todo). :)

## Current features

- View a list of developer-featured levels (as seen in-game) with thumbnails, descriptions, etc
- Lookup levels by their level sharing code

## Todo

Should be possible, but I'm only willing to put in the time if people want them:
- Asset proxy to download level data without CORS issues
- Level map parser + renderer to preview levels in the browser
- Figure out how to display
- API

Would be a lot more work and probably won't happen:
- Figure out how to scrape *all* levels to show lists of new levels, and make sure that data can be backed up for such a time as when the service closes.
- Index levels by author, contents, difficulty, etc

## Notes

The API endpoints this tool uses was pulled out from the [level editor beta](https://hempuli.itch.io/baba-is-you-level-editor-beta). It may stop working if these endpoints disappear at some point in the future.

I have documented the endpoints I've been able to find so far [here](https://gist.github.com/jaames/b213f44e82227e729ea8ba429325d452).

Also, it's possible to download level data from S3, just note that it is zlib-compressed. :)