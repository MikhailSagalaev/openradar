import type { Lead, SinkAdapter } from '../core/types.ts';

export const consoleSink: SinkAdapter = {
  kind: 'console',
  async deliver(lead, ctx): Promise<void> {
    ctx.logger.info('lead', {
      id: lead.id,
      score: lead.score,
      title: lead.title,
      city: lead.city,
      budget: lead.budget,
      url: lead.url,
    });
  },
};
