import type { FormSubmittedEvent } from '@netlify/functions';

type EmbedField = { name: string; value: string; inline: boolean };
type ApplicationEmbed = {
  author: { name: string };
  title: string;
  description: string;
  color: number;
  fields: EmbedField[];
  footer: { text: string };
  timestamp: string;
};

function escapeText(value: string): string {
  return value.replace(/([\\`*_{}\[\]()<>~|])/g, '\\$1');
}

export function messages(data: Record<string, string>, reference: string): ApplicationEmbed[] {
  const fields: EmbedField[] = [];
  const used = new Set(['bot-field', 'form-name', 'ip', 'user_agent', 'referrer']);
  // Split long answers without dropping text or splitting emoji.
  function add(name: string, value: string, inline = false) {
    if (!value.trim()) return;
    let part = '';
    let index = 0;
    for (const character of value) {
      if (part.length + character.length > 1000) {
        fields.push({ name: index++ ? `${name} (continued)` : name, value: part, inline });
        part = '';
      }
      part += character;
    }
    if (part) fields.push({ name: index ? `${name} (continued)` : name, value: part, inline });
  }
  function take(key: string): string {
    used.add(key);
    return escapeText(data[key] || '');
  }
  const staff = data.application_type === 'staff' || data.goal === 'organization';
  const goal = take('goal');
  const type = take('application_type');
  const size = take('squad_size');
  const lane = take('main_lane');
  add('Review status', 'New · Awaiting review', true);
  add('Reference', reference, true);
  add('Application', staff ? 'Staff recruitment' : type === 'alone' ? 'Solo player' : type === 'squad' ? `Squad · ${size || '—'} players` : type || 'Player recruitment', true);
  add('Focus', goal === 'compete' ? 'Competitive play' : goal === 'organization' ? 'Organization & staff' : goal, true);
  if (lane && !staff) add('Primary lane', lane, true);

  for (let player = 1; player <= 5; player++) {
    const details = [
      ['In-game name', 'ign'], ['Lane', 'lane'], ['Character ID', 'character_id'],
      ['Server ID', 'server_id'], ['Peak stars / rank', 'highest_star'], ['Discord', 'discord'],
    ].map(([label, key]) => {
      const value = take(`player${player}_${key}`);
      return value ? `**${label}:** ${value}` : '';
    }).filter(Boolean);
    if (details.length) add(player === 1 ? 'Player 01 · Primary contact' : `Player ${String(player).padStart(2, '0')} · Squad member`, details.join('\n'));
  }
  for (const [key, label] of [
    ['full_name', 'Applicant name'], ['position', 'Requested position'],
    ['discord_handle', 'Discord contact'], ['past_experience', 'Experience & achievements'],
  ]) add(label, take(key), key !== 'past_experience');

  // Keep any future form fields visible as well.
  for (const [key, value] of Object.entries(data)) {
    if (!used.has(key)) add(escapeText(key.replaceAll('_', ' ')).slice(0, 240), escapeText(value));
  }
  const title = staff ? 'Staff recruitment / New application' : type === 'squad' ? 'Squad recruitment / New application' : 'Player recruitment / New application';
  const description = staff
    ? 'A new applicant wants to join the team behind the team. Review their role, experience and Discord contact below.'
    : type === 'squad'
      ? 'A squad has applied to compete with Fnatic Wolf. Review the roster below; Player 01 is the primary contact.'
      : 'A player has applied to compete with Fnatic Wolf. Their profile and Discord contact are ready for review.';
  const timestamp = new Date().toISOString();
  const embeds: ApplicationEmbed[] = [];
  let current: EmbedField[] = [];
  let length = 0;
  function flush() {
    embeds.push({ author: { name: 'FNATIC WOLF / RECRUITMENT DESK' }, title, description, color: 0xee8553, fields: current,
      footer: { text: `Fnatic Wolf • ${reference} • Recruitment site` }, timestamp });
    current = [];
    length = 0;
  }
  for (const field of fields) {
    if (current.length === 25 || length + field.name.length + field.value.length > 4800) flush();
    current.push(field);
    length += field.name.length + field.value.length;
  }
  if (current.length || !embeds.length) flush();
  if (embeds.length > 1) embeds.forEach((embed, index) => {
    embed.footer.text += ` • Part ${index + 1} of ${embeds.length}`;
  });
  return embeds;
}

async function sendMessage(webhook: URL, embed: ApplicationEmbed): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Fnatic Wolf Recruitment', embeds: [embed], allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new Error('Discord notification could not be delivered. Application remains in Netlify Forms.');
    }
    if (response.ok) return;
    if (response.status === 429 && attempt < 2) {
      const body = await response.json().catch(() => ({}));
      const delay = Number(body.retry_after);
      if (Number.isFinite(delay) && delay >= 0 && delay <= 5) {
        await new Promise(resolve => setTimeout(resolve, Math.ceil(delay * 1000) + 100));
        continue;
      }
    }
    throw new Error(`Discord notification failed (HTTP ${response.status}). Application remains in Netlify Forms.`);
  }
}

export default {
  async formSubmitted(event: FormSubmittedEvent) {
    if (event.data['form-name'] && event.data['form-name'] !== 'fnatic-recruitment') return;
    const configured = Netlify.env.get('DISCORD_WEBHOOK_URL');
    if (!configured) throw new Error('Discord webhook is not configured.');
    let webhook: URL;
    try {
      webhook = new URL(configured);
    } catch {
      throw new Error('Discord webhook configuration is invalid.');
    }
    if (webhook.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(webhook.hostname) || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(webhook.pathname)) {
      throw new Error('Discord webhook configuration is invalid.');
    }
    webhook.searchParams.set('wait', 'true');
    const reference = `FW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    for (const message of messages(event.data, reference)) await sendMessage(webhook, message);
  },
};
