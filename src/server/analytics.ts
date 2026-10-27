import type { Env } from '../core/types.ts';

/**
 * Web analytics and search console verification, all optional and set per deployment
 * through env, so a self-hosted node never reports to someone else's counters.
 */
export interface AnalyticsConfig {
  yandexMetrikaId?: string;
  googleAnalyticsId?: string;
  googleSiteVerification?: string;
  yandexVerification?: string;
}

const pick = (value: string | undefined, pattern: RegExp): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && pattern.test(trimmed) ? trimmed : undefined;
};

export function analyticsFromEnv(env: Env): AnalyticsConfig {
  return {
    yandexMetrikaId: pick(env.RADAR_YANDEX_METRIKA_ID, /^\d{4,12}$/),
    googleAnalyticsId: pick(env.RADAR_GA_ID, /^G-[A-Z0-9]{4,16}$/),
    googleSiteVerification: pick(env.RADAR_GOOGLE_SITE_VERIFICATION, /^[\w-]{10,100}$/),
    yandexVerification: pick(env.RADAR_YANDEX_VERIFICATION, /^[a-f0-9]{8,64}$/i),
  };
}

/** Tags for <head>. Values are validated above, so they are safe to interpolate. */
export function analyticsHead(config: AnalyticsConfig): string {
  const parts: string[] = [];
  if (config.googleSiteVerification) {
    parts.push(`<meta name="google-site-verification" content="${config.googleSiteVerification}">`);
  }
  if (config.yandexMetrikaId) {
    const id = config.yandexMetrikaId;
    parts.push(`<script>
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${id}','ym');
ym(${id},'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:'dataLayer',referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
</script>`);
  }
  if (config.googleAnalyticsId) {
    const id = config.googleAnalyticsId;
    parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`);
  }
  return parts.join('\n');
}

/** Body fallback for visitors without JavaScript. */
export function analyticsBody(config: AnalyticsConfig): string {
  return config.yandexMetrikaId
    ? `<noscript><div><img src="https://mc.yandex.ru/watch/${config.yandexMetrikaId}" style="position:absolute;left:-9999px" alt=""></div></noscript>`
    : '';
}

/** Content-Security-Policy with the counters' hosts added only when they are enabled. */
export function contentSecurityPolicy(config: AnalyticsConfig): string {
  const script = ["'self'", "'unsafe-inline'"];
  const img = ["'self'", 'data:'];
  const connect = ["'self'"];
  const frame: string[] = [];
  const ancestors: string[] = [];
  if (config.yandexMetrikaId) {
    script.push('https://mc.yandex.ru', 'https://yastatic.net');
    img.push('https://mc.yandex.ru', 'https://mc.yandex.com');
    connect.push('https://mc.yandex.ru', 'https://mc.yandex.com', 'wss://mc.yandex.ru');
    frame.push('https://mc.yandex.ru', 'https://mc.yandex.com');
    // Webvisor and the click map open the site inside Metrika.
    ancestors.push('https://webvisor.com', 'https://*.webvisor.com', 'https://metrika.yandex.ru', 'https://metrika.yandex.com');
  }
  if (config.googleAnalyticsId) {
    script.push('https://www.googletagmanager.com');
    img.push('https://*.google-analytics.com', 'https://*.googletagmanager.com');
    connect.push('https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com');
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(' ')}`,
    `connect-src ${connect.join(' ')}`,
    `frame-src ${frame.length ? frame.join(' ') : "'none'"}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${ancestors.length ? ancestors.join(' ') : "'none'"}`,
  ].join('; ');
}
