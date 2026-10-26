// ── Your bot script. Put it in the Node.js panel and run:  node bot.js ──
// Set these 2 variables in the panel (Startup / Environment) or in a .env file next to this file:
//   BOT_TOKEN = the token BotFather gave you      (12345678:AbCdEf...)
//   LYNKO_URL = your Lynko website address        (https://your-lynko-site.com)
try { require('fs').readFileSync('.env', 'utf8').split(/\r?\n/).forEach(l => { const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }); } catch {}
const { Bot } = require('./lynko-bot');
const bot = new Bot(process.env.BOT_TOKEN, process.env.LYNKO_URL);

bot.command('start', ctx => ctx.reply(`Hi ${ctx.from.first_name}! 👋 I am alive.\nSend /help to see what I can do.`));
bot.command('help',  ctx => ctx.reply('/start — say hi\n/ping — check if I am online\n/time — current time\n/echo text — I repeat it\nOr just send any message.'));
bot.command('ping',  ctx => ctx.reply('pong 🏓'));
bot.command('time',  ctx => ctx.reply(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })));
bot.command('echo',  ctx => ctx.reply(ctx.args || 'Usage: /echo hello'));
bot.on('text', async ctx => { await ctx.typing(); await ctx.reply('You said: ' + ctx.text); });   // runs for every non-command message

bot.launch();
process.once('SIGINT', () => bot.stop()); process.once('SIGTERM', () => bot.stop());
