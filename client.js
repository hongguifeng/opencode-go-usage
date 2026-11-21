/**
 * Client half of the OpenCode Go usage bundle.
 *
 * It fills the composer's dock row — the line under the input card that hosts
 * the context meter — with one compact pill that shows how much of this
 * month's allowance is left. Opening it shows a small panel with all three
 * allowance windows, their reset instants, and a refresh action.
 */

window.__ModuleLoader__.load({
  id: '@local/opencode-go-usage',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    /** Locale namespace owning this bundle's copy. */
    const NS = 'opencode-go-usage';
    /** Host half's snapshot route. */
    const STATE_URL = '/opencode-go-usage/state';
    /** How often the browser re-reads the Host snapshot while visible. */
    const POLL_MS = 15_000;
    /** Width of the opened panel, capped to the viewport at render time. */
    const PANEL_WIDTH = 268;
    /** The three allowance windows, in display order. */
    const WINDOWS = [
      ['rolling', 'label.rolling', 'label.rolling.long'],
      ['weekly', 'label.weekly', 'label.weekly.long'],
      ['monthly', 'label.monthly', 'label.monthly.long'],
    ];

    const en = {
      name: 'OpenCode Go',
      'label.rolling': '5h',
      'label.weekly': 'W',
      'label.monthly': 'M',
      'label.rolling.long': '5-hour window',
      'label.weekly.long': 'This week',
      'label.monthly.long': 'This month',
      'status.loading': 'reading…',
      'status.invalid': 'usage unavailable',
      'status.unreachable': 'usage offline',
      'status.pending': 'waiting',
      'error.missing-credential': 'no API key',
      'error.unauthorized': 'key rejected',
      'error.not-subscribed': 'no Go plan',
      'error.invalid-response': 'bad response',
      'error.network': 'network error',
      'error.http': 'request failed',
      'limited': 'limited',
      'refresh': 'Refresh',
      'refresh.busy': 'Refreshing…',
      'resets': 'resets',
      'resetIn': 'in {time}',
      'resetAt': 'resets {time}',
      'daysLeft': 'in {days}d',
      'updated': 'Updated',
      'remaining': '{percent}% left',
      'monthly.left': '{percent}%',
      'used': '{percent}% used',
      'open': 'Show every OpenCode Go allowance window',
      'aria': 'OpenCode Go plan usage',
    };

    const zh = {
      name: 'OpenCode Go',
      'label.rolling': '5h',
      'label.weekly': '周',
      'label.monthly': '月',
      'label.rolling.long': '5 小时窗口',
      'label.weekly.long': '本周',
      'label.monthly.long': '本月',
      'status.loading': '读取中…',
      'status.invalid': '用量不可用',
      'status.unreachable': '用量未连接',
      'status.pending': '等待读取',
      'error.missing-credential': '未配置 Key',
      'error.unauthorized': 'Key 无效',
      'error.not-subscribed': '未订阅 Go',
      'error.invalid-response': '响应异常',
      'error.network': '网络错误',
      'error.http': '请求失败',
      'limited': '已限流',
      'refresh': '刷新',
      'refresh.busy': '刷新中…',
      'resets': '重置',
      'resetIn': '{time}后',
      'resetAt': '{time} 重置',
      'daysLeft': '{days} 天后',
      'updated': '更新于',
      'remaining': '剩 {percent}%',
      'monthly.left': '{percent}%',
      'used': '已用 {percent}%',
      'open': '展开 OpenCode Go 全部额度窗口',
      'aria': 'OpenCode Go 套餐用量',
    };

    const CSS = `
.ogu-anchor{display:inline-flex;flex:none}
.ogu-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:1px 8px;border:0;
  background:0 0;border-radius:6px;color:var(--dsw-alias-label-tertiary);font:inherit;
  font-size:var(--dsh-content-font-size-secondary,13px);
  line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));
  font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;flex:none}
.ogu-pill:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.ogu-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ogu-pill[aria-expanded=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.ogu-pill:disabled{cursor:default;opacity:.7}
.ogu-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}
.ogu-dot.is-danger{background:var(--dsw-alias-state-error-primary)}
.ogu-name{color:var(--dsw-alias-label-secondary);font-weight:500}
.ogu-v{color:var(--dsw-alias-label-secondary)}
.ogu-v.is-warn{color:var(--dsw-alias-state-warn-primary)}
.ogu-v.is-danger{color:var(--dsw-alias-state-error-primary)}
.ogu-error{color:var(--dsw-alias-state-error-primary)}
.ogu-spin{animation:ogu-spin 1s linear infinite}
@keyframes ogu-spin{to{transform:rotate(360deg)}}
.ogu-panel{position:fixed;z-index:1100;box-sizing:border-box;padding:12px;border-radius:12px;
  background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l1);
  box-shadow:var(--dsw-elevation-panel,0 12px 32px rgba(0,0,0,.18));
  color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;
  display:flex;flex-direction:column;gap:11px;overflow:auto}
.ogu-panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.ogu-panel-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600}
.ogu-panel-sub{color:var(--dsw-alias-label-secondary);font-size:11px}
.ogu-row{display:flex;flex-direction:column;gap:4px}
.ogu-row-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ogu-row-label{color:var(--dsw-alias-label-secondary)}
.ogu-row-value{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-weight:500}
.ogu-row-value.is-warn{color:var(--dsw-alias-state-warn-primary)}
.ogu-row-value.is-danger{color:var(--dsw-alias-state-error-primary)}
.ogu-bar{height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.ogu-bar-fill{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .3s ease}
.ogu-bar-fill.is-warn{background:var(--dsw-alias-state-warn-primary)}
.ogu-bar-fill.is-danger{background:var(--dsw-alias-state-error-primary)}
.ogu-row-foot{display:flex;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11px}
.ogu-panel-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;
  border-top:.5px solid var(--dsw-alias-border-l1);padding-top:8px}
.ogu-foot-note{color:var(--dsw-alias-label-secondary);font-size:11px}
.ogu-link{appearance:none;border:0;background:0 0;color:var(--dsw-alias-brand-primary);cursor:pointer;
  font:inherit;font-size:11px;padding:2px 5px;border-radius:4px;display:inline-flex;align-items:center;gap:4px}
.ogu-link:hover{background:var(--dsw-alias-bg-layer-2)}
.ogu-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
`;

    /**
     * Round a percentage for display, keeping one decimal below ten percent.
     * @param value - Percentage from the Host snapshot.
     */
    function formatPercent(value) {
      const clamped = Math.min(100, Math.max(0, value));
      const rounded = Math.round(clamped * 10) / 10;
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    }

    /**
     * Short duration such as `3d 4h`, `2h 10m`, or `8m`.
     * @param ms - Milliseconds remaining.
     */
    function formatDuration(ms) {
      if (!Number.isFinite(ms)) return '';
      if (ms <= 0) return '0m';
      const minutes = Math.floor(ms / 60_000);
      if (minutes < 1) return '<1m';
      const days = Math.floor(minutes / 1_440);
      const hours = Math.floor((minutes % 1_440) / 60);
      const rest = minutes % 60;
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${rest}m`;
      return `${rest}m`;
    }

    /**
     * Local clock reading for a reset instant.
     * @param ms - Epoch milliseconds, or null when the gateway omitted it.
     */
    function formatInstant(ms) {
      if (!Number.isFinite(ms)) return '';
      return new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    /**
     * Warning level of one meter.
     * @param percent - Used share of the window.
     */
    function levelOf(percent) {
      if (percent >= 85) return 'danger';
      if (percent >= 60) return 'warn';
      return 'ok';
    }

    /**
     * The dock-row pill and its opened panel.
     * @param props - slot props; `t` is bound to this bundle's namespace.
     */
    function UsagePill({ t }) {
      const translate = React.useCallback((key) => (typeof t === 'function' ? t(key) : key), [t]);
      const format = React.useCallback(
        (key, values) =>
          Object.entries(values).reduce(
            (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
            translate(key),
          ),
        [translate],
      );
      const [view, setView] = React.useState({ status: 'loading' });
      const [busy, setBusy] = React.useState(false);
      const [open, setOpen] = React.useState(false);
      const [position, setPosition] = React.useState(undefined);
      const anchorRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const alive = React.useRef(true);

      React.useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);

      const load = React.useCallback(async (force) => {
        if (force) setBusy(true);
        try {
          const response = await fetch(`${STATE_URL}${force ? '?force=1' : ''}`, {
            headers: { accept: 'application/json' },
            cache: 'no-store',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (alive.current) setView({ status: 'ready', data });
        } catch (error) {
          if (alive.current) {
            setView({
              status: 'unreachable',
              message: error instanceof Error ? error.message : String(error),
            });
          }
        } finally {
          if (force && alive.current) setBusy(false);
        }
      }, []);

      React.useEffect(() => {
        void load(false);
        const timer = setInterval(() => {
          if (!document.hidden) void load(false);
        }, POLL_MS);
        const onVisible = () => {
          if (!document.hidden) void load(false);
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [load]);

      // Place the panel above the pill, clamped to the viewport, and keep it
      // there while the window resizes or the page scrolls.
      React.useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => {
          const anchor = anchorRef.current;
          if (anchor === null) return;
          const rect = anchor.getBoundingClientRect();
          const width = Math.min(PANEL_WIDTH, window.innerWidth - 24);
          const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
          setPosition({
            left,
            width,
            bottom: Math.max(12, window.innerHeight - rect.top + 8),
            maxHeight: Math.max(140, rect.top - 20),
          });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
          window.removeEventListener('resize', place);
          window.removeEventListener('scroll', place, true);
        };
      }, [open]);

      React.useEffect(() => {
        if (!open) {
          setPosition(undefined);
          return undefined;
        }
        const onPointerDown = (event) => {
          const target = event.target;
          if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
          setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open]);

      const data = view.status === 'ready' ? view.data : undefined;
      const meters = data?.ok === true ? data.meters : undefined;
      const failure = data !== undefined && data.ok !== true ? data.error : undefined;
      const now = Date.now();
      const rows = meters === undefined
        ? []
        : WINDOWS.filter(([key]) => meters[key] !== undefined).map(([key, short, long]) => ({
            key,
            short: translate(short),
            long: translate(long),
            meter: meters[key],
          }));
      const monthly = rows.find((row) => row.key === 'monthly');
      const limited = rows.some((row) => row.meter.limited);

      const tooltip = [
        `${translate('name')} · ${translate('aria')}`,
        ...rows.map((row) => {
          const percent = formatPercent(row.meter.percent);
          const reset = formatInstant(row.meter.resetsAt);
          return `${row.long}: ${format('used', { percent })}${reset === '' ? '' : ` · ${translate('resets')} ${reset}`}`;
        }),
        data?.ok === true && Number.isFinite(data.fetchedAt)
          ? `${translate('updated')} ${new Date(data.fetchedAt).toLocaleTimeString()}`
          : '',
        failure === undefined ? '' : failure.message,
      ]
        .filter((line) => line !== '')
        .join('\n');

      let label;
      if (view.status === 'loading') {
        label = h('span', null, translate('status.loading'));
      } else if (view.status === 'unreachable') {
        label = h('span', { className: 'ogu-error' }, translate('status.unreachable'));
      } else if (failure !== undefined) {
        label = h('span', { className: 'ogu-error' }, translate(`error.${failure.code}`));
      } else if (monthly === undefined) {
        label = h('span', null, translate('status.pending'));
      } else if (monthly.meter.limited) {
        label = h('span', { className: 'ogu-v is-danger' }, translate('limited'));
      } else {
        const level = monthly.meter.limited ? 'danger' : levelOf(monthly.meter.percent);
        label = h(
          'span',
          { className: `ogu-v${level === 'ok' ? '' : ` is-${level}`}` },
          format('monthly.left', { percent: formatPercent(100 - monthly.meter.percent) }),
        );
      }

      const panel = open
        ? ReactDOM.createPortal(
            h(
              'div',
              {
                ref: panelRef,
                className: 'ogu-panel',
                role: 'dialog',
                'aria-label': translate('aria'),
                style: position === undefined
                  ? { visibility: 'hidden', left: 0, bottom: 0, width: PANEL_WIDTH }
                  : position,
              },
              h(
                'div',
                { className: 'ogu-panel-head' },
                h('span', { className: 'ogu-panel-title' }, translate('name')),
                limited
                  ? h('span', { className: 'ogu-row-value is-danger' }, translate('limited'))
                  : null,
              ),
              rows.length === 0
                ? h(
                    'div',
                    { className: 'ogu-row-foot' },
                    h('span', { className: 'ogu-error' }, failure === undefined
                      ? translate('status.pending')
                      : translate(`error.${failure.code}`)),
                  )
                : rows.map((row) => {
                    const level = row.meter.limited ? 'danger' : levelOf(row.meter.percent);
                    const used = formatPercent(row.meter.percent);
                    const left = formatPercent(100 - row.meter.percent);
                    const reset = row.meter.resetsAt;
                    let resetText = '';
                    if (row.meter.limited) {
                      resetText = translate('limited');
                    } else if (Number.isFinite(reset)) {
                      resetText = reset - now <= 24 * 3_600_000
                        ? format('resetIn', { time: formatDuration(reset - now) })
                        : format('resetAt', { time: formatInstant(reset) });
                      // The weekly and monthly windows reset days away, so name
                      // how many days that is beside the instant.
                      if (row.key !== 'rolling') {
                        const days = Math.ceil((reset - now) / 86_400_000);
                        if (days >= 1) resetText = `${resetText} · ${format('daysLeft', { days })}`;
                      }
                    }
                    return h(
                      'div',
                      { className: 'ogu-row', key: row.key },
                      h(
                        'div',
                        { className: 'ogu-row-head' },
                        h('span', { className: 'ogu-row-label' }, row.long),
                        h(
                          'span',
                          { className: `ogu-row-value${level === 'ok' ? '' : ` is-${level}`}` },
                          format('remaining', { percent: left }),
                        ),
                      ),
                      h(
                        'div',
                        { className: 'ogu-bar' },
                        h('span', {
                          className: `ogu-bar-fill${level === 'ok' ? '' : ` is-${level}`}`,
                          style: { width: `${Math.min(100, Math.max(row.meter.percent > 0 ? 2 : 0, row.meter.percent))}%` },
                        }),
                      ),
                      h(
                        'div',
                        { className: 'ogu-row-foot' },
                        h('span', null, format('used', { percent: used })),
                        resetText === '' ? null : h('span', null, resetText),
                      ),
                    );
                  }),
              h(
                'div',
                { className: 'ogu-panel-foot' },
                h(
                  'span',
                  { className: 'ogu-foot-note' },
                  data?.ok === true && Number.isFinite(data.fetchedAt)
                    ? `${translate('updated')} ${new Date(data.fetchedAt).toLocaleTimeString()}`
                    : '',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'ogu-link',
                    onClick: () => void load(true),
                    disabled: busy,
                  },
                  h(
                    'svg',
                    {
                      viewBox: '0 0 16 16',
                      width: 11,
                      height: 11,
                      'aria-hidden': true,
                      className: busy ? 'ogu-spin' : undefined,
                    },
                    h('path', {
                      d: 'M13.8 1.9v3.4h-3.4M13.3 5.2A5.6 5.6 0 1 0 13.7 8',
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: 1.6,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                    }),
                  ),
                  translate(busy ? 'refresh.busy' : 'refresh'),
                ),
              ),
            ),
            document.body,
          )
        : null;

      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        h(
          'span',
          { className: 'ogu-anchor', ref: anchorRef },
          h(
            'button',
            {
              type: 'button',
              className: 'ogu-pill',
              title: tooltip,
              onClick: () => {
                setOpen((value) => !value);
                if (!open) void load(false);
              },
              'aria-expanded': open,
              'aria-haspopup': 'dialog',
              'aria-label': `${translate('aria')} — ${translate('open')}`,
            },
            h('span', { className: `ogu-dot${limited ? ' is-danger' : ''}` }),
            label,
          ),
        ),
        panel,
      );
    }

    return {
      inject: ['slots', 'locale'],
      /**
       * Register the dictionaries and the composer-dock occupant.
       * @param ctx - Client root context.
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'opencode-go-usage: dictionaries');
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'opencode-go-usage', order: 0, locale: NS },
            UsagePill,
          ),
        );
      },
    };
  },
});
