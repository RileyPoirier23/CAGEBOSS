# Putting CAGE BOSS on Steam

The game is ready for Steam's two big features (achievements and cloud saves). What's left
needs a Steamworks partner account, which only the developer can set up.

## What you need first

1. A **Steamworks partner account** (partner.steamgames.com) and the **Steam Direct fee**
   (US$100 per game, paid back after the game makes $1,000).
2. Your game's **App ID** (Steamworks gives you one when you create the app).

## Achievements

Every achievement in the game already unlocks on Steam when Steam is running, as long as:

1. `steamworks.js` is installed: `npm install steamworks.js` (it's optional, so builds
   without it still work).
2. The App ID is known: put it in a file called `steam_appid.txt` next to the game's
   executable (or set the `STEAM_APPID` environment variable). Steam does this for you when
   it launches the game.
3. In Steamworks → **Stats & Achievements**, create achievements whose **API Name** is the
   same as the game's achievement ids. The full list (id, name, description) is in
   `src/sim/achievements.ts`. Icons: 64×64 PNGs.

Achievements a player earned before Steam was there are unlocked on Steam the next time they
start the game with Steam running.

## Cloud saves

Every save, setting and achievement is also written as a plain file in the game's user-data
folder, in `saves/`. At startup those files win, so whatever Steam Cloud brings down from
another computer is what you play. Nothing in the code needs changing: in Steamworks →
**Steam Cloud** → **Auto-Cloud**, add one root per platform:

| OS | Root | Subdirectory | Pattern |
|---|---|---|---|
| Windows | `WinAppDataRoaming` | `CAGE BOSS/saves` | `*.txt` |
| macOS | `MacAppSupport` | `CAGE BOSS/saves` | `*.txt` |
| Linux | `LinuxXdgConfigHome` | `CAGE BOSS/saves` | `*.txt` |

Set the byte quota to about 50 MB and the file count to 200.

## Uploading builds

Build with `npm run dist:win` / `dist:mac` / `dist:linux` and upload the unpacked folders
(`release/win-unpacked`, the `.app` inside `release/mac*`, `release/linux-unpacked`) as
depots with SteamPipe. When the game runs under Steam it doesn't update itself: Steam does.
