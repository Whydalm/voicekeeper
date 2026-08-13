# VoiceKeeper

A Discord bot that joins a designated voice channel and stays connected around the clock, keeping a running total of accumulated time. Built with [discord.js](https://discord.js.org/) and [@discordjs/voice](https://github.com/discordjs/discord.js/tree/main/packages/voice).

## Features

- Connects to a specific voice channel on startup and remains present indefinitely
- Automatically detects disconnects and reconnects without manual intervention
- Persists accumulated time to disk (`time-data.json`), surviving restarts
- Exposes a `/time` slash command that reports the total time tracked, formatted as days/hours/minutes/seconds
- Graceful shutdown handling (`SIGINT`/`SIGTERM`) flushes in-progress session time before exiting
- Detailed connection-state logging for easier debugging of permission or network issues

## Tech stack

- [Node.js](https://nodejs.org/)
- [discord.js](https://discord.js.org/) v14
- [@discordjs/voice](https://www.npmjs.com/package/@discordjs/voice)
- [libsodium-wrappers](https://www.npmjs.com/package/libsodium-wrappers) for voice encryption (pure JS, no native build step required)

## Setup

1. Create an application and bot at the [Discord Developer Portal](https://discord.com/developers/applications), copy the bot token, and invite it to your server with the `bot` and `applications.commands` scopes plus `View Channel`, `Connect`, and `Speak` permissions.
2. Enable Developer Mode in Discord (User Settings → Advanced) to copy your server ID and target voice channel ID.
3. Copy `.env.example` to `.env` and fill in the values:

   ```
   DISCORD_TOKEN=your_bot_token
   GUILD_ID=your_server_id
   VOICE_CHANNEL_ID=your_voice_channel_id
   ```

4. Install dependencies and start the bot:

   ```bash
   npm install
   npm start
   ```

The bot will log its connection status to the console, join the configured voice channel, and start tracking time. Run `/time` in any text channel on the server to see the current total.

## Running 24/7

For continuous uptime, run the bot under a process manager such as [pm2](https://pm2.keymetrics.io/) so it survives crashes and can restart automatically:

```bash
npm install -g pm2
pm2 start index.js --name voicekeeper
pm2 save
pm2 startup   # enables auto-start on boot (Linux) — follow the printed command
```

This works on any always-on machine — a personal computer left running, or a Linux VPS.

## Notes

- If the server has an AFK channel configured (Server Settings → Overview → AFK Channel), Discord may move inactive members — including bots — there after the configured timeout. Set it to "None" or increase the timeout to keep the bot in place.
- `time-data.json` and `.env` are gitignored since they contain runtime state and secrets respectively.

## License

MIT
