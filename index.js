require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const DATA_FILE = path.join(__dirname, 'time-data.json');
const SAVE_INTERVAL_MS = 30 * 1000; // как часто сохраняем прогресс на диск
const RECONNECT_DELAY_MS = 5000;

if (!TOKEN || !GUILD_ID || !VOICE_CHANNEL_ID) {
  console.error('Заполни DISCORD_TOKEN, GUILD_ID и VOICE_CHANNEL_ID в файле .env');
  process.exit(1);
}

// ---------- Хранение накопленного времени ----------
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.error('Не удалось прочитать time-data.json, начинаю с нуля:', e.message);
    }
  }
  return { totalSeconds: 0 };
}

const data = loadData();
let sessionStartedAt = null; // когда бот в этот раз зашёл в войс

function flushSession() {
  if (sessionStartedAt) {
    const elapsed = (Date.now() - sessionStartedAt) / 1000;
    data.totalSeconds += elapsed;
    sessionStartedAt = Date.now(); // рестарт отсчёта текущей сессии, чтобы не задвоить время
  }
}

function saveData() {
  flushSession();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts = [];
  if (days) parts.push(`${days} дн`);
  if (hours || days) parts.push(`${hours} ч`);
  if (minutes || hours || days) parts.push(`${minutes} мин`);
  parts.push(`${seconds} сек`);
  return parts.join(' ');
}

setInterval(saveData, SAVE_INTERVAL_MS);

// ---------- Discord клиент ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let connection = null;
let reconnecting = false;

async function connectToVoice() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error(`Не нашёл канал с ID ${VOICE_CHANNEL_ID} на сервере ${guild.name}. Проверь VOICE_CHANNEL_ID в .env.`);
    return;
  }
  console.log(`Подключаюсь к каналу "${channel.name}"...`);

  connection = joinVoiceChannel({
    channelId: VOICE_CHANNEL_ID,
    guildId: GUILD_ID,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`Статус соединения: ${oldState.status} -> ${newState.status}`);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15000);
    sessionStartedAt = Date.now();
    console.log('Зашёл в войс-канал, начинаю копить время.');
  } catch (err) {
    console.error('Не удалось подключиться за 15 секунд. Вероятная причина: у бота нет прав View Channel/Connect на этом канале, либо канал закрыт для роли.');
    console.error('Подробности ошибки:', err.message);
  }

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    flushSession();
    sessionStartedAt = null;
    try {
      // даём соединению шанс восстановиться самому (например, при смене региона голосового сервера)
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
      sessionStartedAt = Date.now();
    } catch {
      if (reconnecting) return;
      reconnecting = true;
      console.log(`Соединение разорвано, переподключаюсь через ${RECONNECT_DELAY_MS / 1000} сек...`);
      try {
        connection.destroy();
      } catch {
        // соединение уже могло быть уничтожено
      }
      setTimeout(() => {
        reconnecting = false;
        connectToVoice().catch((err) => console.error('Не удалось переподключиться:', err));
      }, RECONNECT_DELAY_MS);
    }
  });

  connection.on('error', (err) => {
    console.error('Ошибка голосового соединения:', err);
  });
}

// ---------- Слэш-команда /time ----------
const commands = [
  new SlashCommandBuilder()
    .setName('time')
    .setDescription('Показать сколько времени бот накопил в войсе'),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
    body: commands,
  });
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'time') {
    flushSession();
    saveData();
    await interaction.reply(`Накоплено времени в войсе: **${formatDuration(data.totalSeconds)}**`);
  }
});

client.once('ready', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    console.error('Не удалось зарегистрировать команды:', err);
  }
  connectToVoice().catch((err) => console.error('Не удалось зайти в войс:', err));
});

// ---------- Аккуратное сохранение при выключении ----------
function shutdown() {
  saveData();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(TOKEN);
