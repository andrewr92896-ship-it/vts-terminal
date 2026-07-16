import { useEffect, useRef } from 'react';

// Thin wrapper around TradingView's external embed widgets. Each widget is a
// <script> that reads its JSON config from its own innerHTML and renders an
// iframe into the sibling container. We (re)inject only when `configKey`
// changes — never on a parent re-render, drag, or resize — so charts don't
// reload while the board is being rearranged (the widgets are `autosize` and
// follow their container on their own).
//
// The script comes from tradingview.com. There is no Content-Security-Policy on
// this app today; if one is added later it must allow script-src / frame-src
// for tradingview.com and s3.tradingview.com.
export function TvWidget({
  src,
  config,
  configKey,
}: {
  src: string;
  config: Record<string, unknown>;
  // A string that changes exactly when the widget must be rebuilt.
  configKey: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Fresh container each build so the script re-runs against an empty slot.
    host.innerHTML = '';
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.height = '100%';
    widget.style.width = '100%';
    host.appendChild(widget);

    const script = document.createElement('script');
    script.src = src;
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify(config);
    host.appendChild(script);

    return () => {
      host.innerHTML = '';
    };
    // config is intentionally excluded — configKey is the rebuild trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, configKey]);

  return (
    <div
      ref={hostRef}
      className="tradingview-widget-container"
      style={{ height: '100%', width: '100%', overflow: 'hidden' }}
    />
  );
}
