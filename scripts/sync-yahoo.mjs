import { mkdir, readFile, writeFile } from 'node:fs/promises';

let token = process.env.YAHOO_ACCESS_TOKEN;
const leagueKey = process.env.YAHOO_LEAGUE_KEY;
const clientId = process.env.YAHOO_CLIENT_ID;
const clientSecret = process.env.YAHOO_CLIENT_SECRET;
const refreshToken = process.env.YAHOO_REFRESH_TOKEN;
if (!token || !leagueKey) throw new Error('Set YAHOO_ACCESS_TOKEN and YAHOO_LEAGUE_KEY before running this script.');

const saveEnvValue = async (name, value) => {
  let env = '';
  try {
    env = await readFile('.env', 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  env = pattern.test(env) ? env.replace(pattern, line) : `${env.trimEnd()}\n${line}\n`;
  await writeFile('.env', env, { mode: 0o600 });
};

const refreshAccessToken = async () => {
  if (!clientId || !clientSecret || !refreshToken) return false;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Yahoo token refresh failed: ${JSON.stringify(data)}`);
  token = data.access_token;
  await saveEnvValue('YAHOO_ACCESS_TOKEN', data.access_token);
  if (data.refresh_token) await saveEnvValue('YAHOO_REFRESH_TOKEN', data.refresh_token);
  return true;
};

const yahooFetch = async (path) => {
  let response = await fetch(`https://fantasysports.yahooapis.com/fantasy/v2/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' }
  });
  if (response.status === 401 && await refreshAccessToken()) {
    response = await fetch(`https://fantasysports.yahooapis.com/fantasy/v2/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' }
    });
  }
  return response;
};

const textValue = (xml, tag) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? '';
const blocks = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((match) => match[1]);
const numberValue = (xml, tag) => Number(textValue(xml, tag) || 0);
const unescapeXml = (value) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const responseXml = async (path) => {
  const response = await yahooFetch(path);
  if (!response.ok) throw new Error(`Yahoo request failed: ${response.status} ${response.statusText} for ${path}`);
  return response.text();
};

const scoringXml = await responseXml(`league/${leagueKey}/settings`);
const scoring = Object.fromEntries([...scoringXml.matchAll(/<stat_id>(\d+)<\/stat_id>\s*<value>(-?[\d.]+)<\/value>/g)].map((match) => [match[1], Number(match[2])]));
const pointsFromStats = (xml) => blocks(xml, 'stat').reduce((total, stat) => total + (numberValue(stat, 'value') * (scoring[textValue(stat, 'stat_id')] ?? 0)), 0);

const playerPointCache = new Map();
const playerPoints = async (playerKey, week) => {
  const cacheKey = `${playerKey}:${week}`;
  if (!playerPointCache.has(cacheKey)) playerPointCache.set(cacheKey, pointsFromStats(await responseXml(`player/${playerKey}/stats;type=week;week=${week}`)));
  return playerPointCache.get(cacheKey);
};

const transactionXml = await responseXml(`league/${leagueKey}/transactions`);
const transactions = blocks(transactionXml, 'transaction').map((transaction) => {
  const players = blocks(transaction, 'player').map((player) => ({
    key: textValue(player, 'player_key'),
    name: unescapeXml(textValue(player, 'full')),
    position: textValue(player, 'display_position'),
    type: textValue(player, 'type'),
    sourceType: textValue(player, 'source_type'),
    team: unescapeXml(textValue(player, 'destination_team_name') || textValue(player, 'source_team_name')),
    teamKey: textValue(player, 'destination_team_key') || textValue(player, 'source_team_key')
  }));
  return {
    id: numberValue(transaction, 'transaction_id'),
    type: textValue(transaction, 'type'),
    status: textValue(transaction, 'status'),
    timestamp: numberValue(transaction, 'timestamp'),
    players
  };
});

const adds = transactions.flatMap((transaction) => transaction.players.filter((player) => player.type === 'add').map((player) => ({
  ...player,
  transactionId: transaction.id,
  timestamp: transaction.timestamp,
  points: 0
})));
const currentWeek = numberValue(transactionXml, 'current_week');
const completedWeek = Math.max(1, currentWeek - 1);
const seasonStart = Date.parse(textValue(transactionXml, 'start_date')) / 1000;
for (const pickup of adds) {
  pickup.startWeek = Math.max(1, Math.floor((pickup.timestamp - seasonStart) / 604800) + 1);
  for (let week = pickup.startWeek; week <= completedWeek; week += 1) pickup.points += await playerPoints(pickup.key, week);
}
const pickups = adds.sort((a, b) => b.points - a.points);
const trades = transactions.filter((transaction) => transaction.type === 'trade');

const teamsXml = await responseXml(`league/${leagueKey}/teams`);
const teamKeys = blocks(teamsXml, 'team').map((team) => ({ key: textValue(team, 'team_key'), name: unescapeXml(textValue(team, 'name')) }));
const quarterbacks = [];
for (const team of teamKeys) {
  const rosterXml = await responseXml(`team/${team.key}/roster;week=${completedWeek}`);
  for (const player of blocks(rosterXml, 'player')) {
    if (textValue(player, 'display_position') !== 'QB') continue;
    const key = textValue(player, 'player_key');
    quarterbacks.push({ key, name: unescapeXml(textValue(player, 'full')), team: team.name, points: await playerPoints(key, completedWeek) });
  }
}
const bestPickup = pickups[0] ?? null;
const bestQB = quarterbacks.sort((a, b) => b.points - a.points)[0] ?? null;

const weeklyScores = [];
for (let week = 1; week <= completedWeek; week += 1) {
  const scoreboardXml = await responseXml(`league/${leagueKey}/scoreboard;week=${week}`);
  weeklyScores.push(...blocks(scoreboardXml, 'team').map((team) => ({
    week,
    teamKey: textValue(team, 'team_key'),
    team: unescapeXml(textValue(team, 'name')),
    points: numberValue(blocks(team, 'team_points')[0] ?? '', 'total'),
    projected: numberValue(blocks(team, 'team_projected_points')[0] ?? '', 'total')
  })));
}

const response = await yahooFetch(`league/${leagueKey}/standings`);
if (!response.ok) throw new Error(`Yahoo request failed: ${response.status} ${response.statusText}`);
const xml = await response.text();
const teams = [...xml.matchAll(/<team>([\s\S]*?)<\/team>/g)].map((match) => {
  const value = (tag) => match[1].match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? '';
  return { name: value('name'), rank: Number(value('rank')), wins: Number(value('wins')), losses: Number(value('losses')), pointsFor: Number(value('points_for')) };
});
const league = JSON.parse(await readFile('src/data/league.json', 'utf8'));
const existingTeams = new Map(league.teams.map((team) => [team.name, team]));
league.season = xml.match(/<season>(\d{4})<\/season>/)?.[1] ?? league.season;
league.week = currentWeek ? `Week ${currentWeek}` : league.week;
league.updatedAt = new Date().toISOString().slice(0, 10);
league.source = 'Yahoo Fantasy API';
league.teams = teams.sort((a, b) => a.rank - b.rank).map((team) => {
  const existing = existingTeams.get(team.name) ?? {};
  const transactionCount = existing.transactionCount ?? 0;
  const buyIn = existing.buyIn ?? league.buyIn;
  const transactionCost = transactionCount * league.transactionFee;
  const winnings = existing.winnings ?? 0;
  return { ...existing, ...team, record: 'Active', points: team.pointsFor, transactionCount, buyIn, transactionCost, winnings, finalPayout: winnings - buyIn - transactionCost };
});
const playerStats = [...playerPointCache.entries()].map(([key, points]) => {
  const [playerKey, week] = key.split(':');
  return { playerKey, week: Number(week), points };
});
const formatPoints = (value) => Number(value.toFixed(1));
league.yahooAwards = [
  ...(bestQB ? [{ label: 'Best QB', value: `${bestQB.name} · ${formatPoints(bestQB.points)} pts`, detail: `${bestQB.team} · through Week ${completedWeek}` }] : []),
  ...(bestPickup ? [{ label: 'Best pickup', value: `${bestPickup.name} · ${bestPickup.team}`, detail: `${formatPoints(bestPickup.points)} points since Week ${bestPickup.startWeek}` }] : []),
  ...(trades.length ? [{ label: 'Best trade', value: `Trade #${trades[0].id}`, detail: `${trades[0].players.map((player) => player.name).filter(Boolean).join(' for ')}` }] : [{ label: 'Best trade', value: 'No trades yet', detail: 'Trade activity will appear here when it happens.' }])
];
league.activity = { weeklyScores, transactions, pickups, trades, playerStats };
await mkdir('src/data', { recursive: true });
await writeFile('src/data/yahoo.json', `${JSON.stringify({ fetchedAt: new Date().toISOString(), leagueKey, teams, weeklyScores, transactions, pickups, trades, playerStats, bestQB, bestPickup }, null, 2)}\n`);
await writeFile('src/data/league.json', `${JSON.stringify(league, null, 2)}\n`);
console.log(`Imported Yahoo standings for ${teams.length} teams.`);