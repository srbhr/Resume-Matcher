import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectKeepZones, computePageStarts } from '@/components/preview/page-breaks';

describe('computePageStarts', () => {
  it('cuts at the page height when nothing must stay together', () => {
    expect(computePageStarts(2500, 1000, [])).toEqual([0, 1000, 2000]);
  });

  it('keeps one page when the content fits', () => {
    expect(computePageStarts(1000, 1000, [{ top: 900, bottom: 1000 }])).toEqual([0]);
  });

  it('moves an entry that would straddle the page end to the next page', () => {
    expect(computePageStarts(1500, 1000, [{ top: 950, bottom: 1100 }])).toEqual([0, 950]);
  });

  it('moves a heading with the entry it keeps company with', () => {
    const zones = [
      { top: 900, bottom: 1080 }, // heading + first entry
      { top: 930, bottom: 1080 }, // the entry
    ];
    expect(computePageStarts(1500, 1000, zones)).toEqual([0, 900]);
  });

  it('splits a long entry between bullets instead of moving it whole', () => {
    // Header + bullets 1-2 end at 700; bullets at 700/760/820/880/940/1000-1060; last two from 1000.
    const zones = [
      { top: 600, bottom: 760 },
      { top: 1000, bottom: 1120 },
      { top: 640, bottom: 700 },
      { top: 700, bottom: 760 },
      { top: 760, bottom: 820 },
      { top: 820, bottom: 880 },
      { top: 880, bottom: 940 },
      { top: 940, bottom: 1000 },
      { top: 1000, bottom: 1060 },
      { top: 1060, bottom: 1120 },
    ];
    expect(computePageStarts(1500, 1000, zones)).toEqual([0, 1000]);
    // Page height 1030 lands inside the last two bullets: they move together.
    expect(computePageStarts(1500, 1030, zones)).toEqual([0, 1000]);
  });

  it('breaks a paragraph between lines and keeps two lines on each side', () => {
    const paragraph = { top: 900, bottom: 1100, lineHeight: 20 }; // 10 lines
    expect(computePageStarts(1500, 1000, [paragraph])).toEqual([0, 1000]);
    expect(computePageStarts(1500, 1010, [paragraph])).toEqual([0, 1000]);
    // One line would be left behind: the whole paragraph moves.
    expect(computePageStarts(1500, 925, [paragraph])).toEqual([0, 900]);
    // One line would carry over: two carry over instead.
    expect(computePageStarts(1500, 1090, [paragraph])).toEqual([0, 1060]);
  });

  it('splits a zone taller than a page once it starts a page', () => {
    expect(computePageStarts(2600, 1000, [{ top: 500, bottom: 2200 }])).toEqual([
      0, 500, 1500, 2500,
    ]);
  });
});

describe('collectKeepZones', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Builds the markup, then gives each element with data-y="top,bottom" that box. */
  const layout = (html: string) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      const [top, bottom] = (this.getAttribute('data-y') ?? '0,0').split(',').map(Number);
      return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top } as DOMRect;
    });
    return container;
  };

  it('ignores hashed module classes and reads the data attributes', () => {
    const container = layout(`
      <div class="_x_resume-section"><h3 class="_x_resume-section-title" data-y="0,20">Old</h3>
      <div class="_x_resume-item" data-y="20,90">Entry</div></div>`);
    expect(collectKeepZones(container)).toEqual([]);
  });

  it('keeps each entry whole and each heading with its first entry', () => {
    const container = layout(`
      <div data-resume-section data-y="0,200">
        <h3 data-resume-section-title data-y="0,20">Experience</h3>
        <div data-resume-item="" data-y="24,100"><ul><li data-y="60,80">a</li></ul></div>
        <div data-resume-item="" data-y="104,200">Second</div>
      </div>`);
    expect(collectKeepZones(container)).toEqual([
      { top: 24, bottom: 100 },
      { top: 104, bottom: 200 },
      { top: 0, bottom: 100 },
    ]);
  });

  it('lets a split entry break between bullets only', () => {
    const container = layout(`
      <div data-resume-section data-y="0,300">
        <h3 data-resume-section-title data-y="0,20">Experience</h3>
        <div data-resume-item="split" data-y="24,300">
          <div data-y="24,60">Title</div>
          <ul>
            <li data-y="60,100">1</li><li data-y="100,140">2</li><li data-y="140,180">3</li>
            <li data-y="180,220">4</li><li data-y="220,260">5</li><li data-y="260,300">6</li>
          </ul>
        </div>
      </div>`);
    const zones = collectKeepZones(container);
    expect(zones).toContainEqual({ top: 24, bottom: 140 }); // header + bullets 1-2
    expect(zones).toContainEqual({ top: 220, bottom: 300 }); // bullets 5-6
    expect(zones).toContainEqual({ top: 140, bottom: 180 }); // bullet 3 whole
    expect(zones).toContainEqual({ top: 0, bottom: 140 }); // heading + header + bullets 1-2
    expect(zones).not.toContainEqual({ top: 24, bottom: 300 });
  });

  it('keeps a heading over text with its first two lines, and lets the text split by line', () => {
    const container = layout(`
      <div data-resume-section data-y="0,200">
        <h3 data-resume-section-title data-y="0,20">Summary</h3>
        <p style="line-height: 20px" data-y="20,200">Long text</p>
      </div>`);
    expect(collectKeepZones(container)).toEqual([
      { top: 20, bottom: 200, lineHeight: 20 },
      { top: 0, bottom: 60 },
    ]);
  });
});
