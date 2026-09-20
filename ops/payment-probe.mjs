import { createHash } from 'crypto';

const api = (
  process.env.TINKOFF_API ?? 'https://securepay.tinkoff.ru/v2'
).replace(/\/+$/, '');
const terminalKey = process.env.TINKOFF_TERMINAL_KEY ?? '';
const password = process.env.TINKOFF_PASSWORD ?? '';

if (!terminalKey || !password) {
  console.log(
    'Нет ключей терминала: задайте TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD',
  );
  process.exit(1);
}
console.log(`терминал: ${terminalKey.slice(0, 4)}… | адрес банка: ${api}`);

const sign = (params) =>
  createHash('sha256')
    .update(
      Object.entries({ ...params, Password: password })
        .filter(([k, v]) => k !== 'Token' && v != null && typeof v !== 'object')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => String(v))
        .join(''),
    )
    .digest('hex');

const payload = {
  TerminalKey: terminalKey,
  Amount: 10000,
  OrderId: `probe-${Date.now()}`,
  Description: 'Проверка связи с эквайрингом',
};

const started = Date.now();
try {
  const res = await fetch(`${api}/Init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, Token: sign(payload) }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  console.log(`ответ за ${Date.now() - started} мс:`, res.status);
  if (data.Success) {
    console.log('платёж создан, ссылка:', data.PaymentURL);
    console.log('связь с банком есть, ключи подходят');
  } else {
    console.log(
      'банк отказал:',
      data.ErrorCode,
      data.Message ?? '',
      data.Details ?? '',
    );
  }
} catch (e) {
  const cause = e.cause ?? {};
  console.log(
    `банк недоступен за ${Date.now() - started} мс:`,
    e.name,
    cause.code ?? cause.message ?? e.message,
  );
  console.log('проверьте интернет, прокси и антивирус: запрос идёт на', api);
  if (String(cause.code ?? '').includes('SELF_SIGNED')) {
    console.log(
      'похоже, HTTPS вскрывает антивирус или прокси: запустите Node с',
      '--use-system-ca или задайте NODE_USE_SYSTEM_CA=1',
    );
  }
}
