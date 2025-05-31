
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const token = 'BOT_TOKENINI_BURAYA_YAZ'; // ← Bot token'ını buraya yapıştır
const prefix = '!';

const queue = new Map();
let volumeLevel = 0.5; // %50 ses
let isLooping = false;

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} olarak giriş yaptı!`);
});

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const serverQueue = queue.get(message.guild.id);
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('Önce bir ses kanalına katılmalısın.');

        const permissions = voiceChannel.permissionsFor(message.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return message.reply('Bu kanalda konuşma yetkim yok.');
        }

        let song;

        if (ytdl.validateURL(args[0])) {
            const songInfo = await ytdl.getInfo(args[0]);
            song = {
                title: songInfo.videoDetails.title,
                url: songInfo.videoDetails.video_url
            };
        } else {
            const searchTerm = args.join(' ');
            const searchResult = await ytSearch(searchTerm);
            if (!searchResult.videos.length) {
                return message.reply('Hiçbir sonuç bulunamadı.');
            }

            const video = searchResult.videos[0];
            song = {
                title: video.title,
                url: video.url
            };
        }

        if (!serverQueue) {
            const queueContruct = {
                voiceChannel,
                connection: null,
                songs: [],
                player: createAudioPlayer()
            };

            queue.set(message.guild.id, queueContruct);
            queueContruct.songs.push(song);

            try {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });
                queueContruct.connection = connection;

                playSong(message.guild, queueContruct.songs[0]);
            } catch (err) {
                console.log(err);
                queue.delete(message.guild.id);
                return message.reply('Şarkı başlatılamadı.');
            }
        } else {
            serverQueue.songs.push(song);
            return message.reply(`Kuyruğa eklendi: **${song.title}**`);
        }
    }

    if (command === 'skip') {
        if (!serverQueue) return message.reply('Atlayacak şarkı yok.');
        serverQueue.player.stop();
        return message.reply('Şarkı atlandı.');
    }

    if (command === 'stop') {
        if (!serverQueue) return message.reply('Zaten şarkı çalmıyor.');
        serverQueue.songs = [];
        serverQueue.player.stop();
        getVoiceConnection(message.guild.id)?.destroy();
        queue.delete(message.guild.id);
        return message.reply('Müzik durduruldu.');
    }

    if (command === 'queue') {
        if (!serverQueue) return message.reply('Kuyruk boş.');
        const titles = serverQueue.songs.map((s, i) => `${i + 1}. ${s.title}`);
        return message.reply(`🎵 Şarkı Kuyruğu:
${titles.join('\n')}`);
    }

    if (command === 'pause') {
        if (!serverQueue || serverQueue.player.state.status !== AudioPlayerStatus.Playing) {
            return message.reply('Şu anda çalan bir şarkı yok.');
        }
        serverQueue.player.pause();
        return message.reply('Müzik duraklatıldı.');
    }

    if (command === 'resume') {
        if (!serverQueue || serverQueue.player.state.status !== AudioPlayerStatus.Paused) {
            return message.reply('Duraklatılmış bir şarkı yok.');
        }
        serverQueue.player.unpause();
        return message.reply('Müzik devam ediyor.');
    }

    if (command === 'volume') {
        const newVolume = parseInt(args[0]);
        if (isNaN(newVolume) || newVolume < 0 || newVolume > 100) {
            return message.reply('Ses seviyesi 0 ile 100 arasında olmalı.');
        }
        volumeLevel = newVolume / 100;
        return message.reply(`Ses seviyesi ayarlandı: %${newVolume}`);
    }

    if (command === 'loop') {
        isLooping = !isLooping;
        return message.reply(\`Tekrar modu \${isLooping ? 'açıldı 🔁' : 'kapatıldı ⏹️'}\`);
    }
});

function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        // Şarkı yok ama bağlantı kalmaya devam edecek
        return;
    }

    const stream = ytdl(song.url, { filter: 'audioonly' });
    const resource = createAudioResource(stream, {
        inlineVolume: true
    });
    resource.volume.setVolume(volumeLevel);

    serverQueue.player.play(resource);
    serverQueue.connection.subscribe(serverQueue.player);

    serverQueue.player.on(AudioPlayerStatus.Idle, () => {
        if (!isLooping) {
            serverQueue.songs.shift();
        } else {
            serverQueue.songs.push(serverQueue.songs.shift());
        }
        playSong(guild, serverQueue.songs[0]);
    });

    serverQueue.player.on('error', error => {
        console.error(error);
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0]);
    });
}

client.login(token);
