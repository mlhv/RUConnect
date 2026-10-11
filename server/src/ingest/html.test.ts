import { describe, expect, it } from 'vitest';
import { chunkText, htmlToText } from './html';

describe('htmlToText', () => {
  it('drops scripts, styles, and navigation and keeps one block per line', () => {
    const html = `<html><head><title>x</title><style>.a{}</style></head><body>
      <nav><a href="/">Home</a></nav>
      <script>var x = 1;</script>
      <div><h3>Highlights Tour</h3><p>Saturday, October 10, 2026, 2:00&nbsp;p.m.</p></div>
      <footer>© Rutgers</footer></body></html>`;
    expect(htmlToText(html, 'https://zimmerli.rutgers.edu/events')).toBe('Highlights Tour\nSaturday, October 10, 2026, 2:00 p.m.');
  });

  it('keeps absolute URLs only for event links and decodes entities', () => {
    const html = '<p><a href="/event/spark-night">SparkNight &amp; Talk</a> <a href="/about">About</a> it&#39;s free</p>';
    expect(htmlToText(html, 'https://zimmerli.rutgers.edu/events')).toBe(
      "SparkNight & Talk [https://zimmerli.rutgers.edu/event/spark-night] About it's free",
    );
  });
});

describe('chunkText', () => {
  it('splits on line boundaries under the limit', () => {
    expect(chunkText('aaaa\nbbbb\ncccc', 9)).toEqual(['aaaa\nbbbb', 'cccc']);
    expect(chunkText('short', 100)).toEqual(['short']);
  });
});
