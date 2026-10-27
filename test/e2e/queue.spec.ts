/**
 * End-to-end, editable queue: "Add to queue" and "Play next" from the library
 * menu, then the Up next panel: order, move, remove, play now, clear; shuffle
 * reorders it and puts it back, repeat one restarts the track; tooltips on
 * icon-only buttons, and the bar's waveform at tablet width: a real width,
 * above the controls, never covered by their tooltips once the pointer moves
 * onto it. A long queue draws a hundred rows at a time.
 */
import { expect, test, type Locator, type Page } from './fixtures'
import { seedLibrary, signUp, uniqueId, uploadTrack } from './helpers'

/**
 * Hovers `target` and expects its tooltip. The mouse first leaves whatever
 * it is on: Playwright jumps straight to the target, and a tooltip already
 * open (the button just clicked) stays open during such a jump.
 */
async function expectTooltip(page: Page, target: Locator, text: string) {
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await target.hover()
  await expect(page.getByRole('tooltip')).toHaveText(text)
}

/** Opens a library row's menu and picks an item. */
async function rowAction(page: Page, title: string, action: string) {
  // The library row of that track.
  const row = page.getByTestId('track-row').filter({ hasText: title })
  await row.getByRole('button', { name: `Actions for ${title}` }).click()
  await page.getByRole('menuitem', { name: action, exact: true }).click()
}

test.describe('editable queue', () => {
  test('add, play next, reorder, remove, play now and clear', async ({ page }) => {
    await signUp(page)
    // Three tracks named uniquely for this test. Two minutes long: a track that ends mid-test moves
    // the queue on by itself (with 3-second tracks a slow CI runner saw "a" end before Remove, so
    // Up next lost "c" too), and nothing here waits for a track to end.
    const id = uniqueId()
    const [a, b, c] = [`qa-${id}`, `qb-${id}`, `qc-${id}`]
    for (const title of [a, b, c]) await uploadTrack(page, title, { seconds: 120 })
    await page.getByRole('link', { name: 'Go to library' }).click()

    // The library shows the newest first (c, b, a): playing "a" leaves nothing after it.
    await page.getByTestId('track-row').filter({ hasText: a }).getByTestId('track-title').click()
    // The player bar.
    const bar = page.getByTestId('player-bar')
    await expect(bar.getByTestId('player-title')).toHaveText(a)

    await rowAction(page, c, 'Add to queue')
    await expect(page.getByText(`${c} added to the queue`).first()).toBeVisible()
    await rowAction(page, b, 'Play next')
    await expect(page.getByText(`${b} plays next`).first()).toBeVisible()
    await rowAction(page, a, 'Add to queue')
    await expect(page.getByText(`${a} is already playing`).first()).toBeVisible()

    // --- The Up next panel ---
    await bar.getByTestId('player-queue').click()
    await expect(page.getByTestId('queue-current')).toHaveText(a)
    // The titles listed in Up next.
    const titles = page.getByTestId('queue-item-title')
    await expect(titles).toHaveText([b, c])

    await page.getByRole('button', { name: `Queue actions for ${b}` }).click()
    await page.getByRole('menuitem', { name: 'Move down' }).click()
    await expect(titles).toHaveText([c, b])

    await page.getByRole('button', { name: `Queue actions for ${b}` }).click()
    await page.getByRole('menuitem', { name: 'Remove from queue' }).click()
    await expect(titles).toHaveText([c])

    // Playing a queued track right away.
    await page.getByRole('button', { name: `Play ${c} now` }).click()
    await expect(page.getByTestId('queue-current')).toHaveText(c)
    await expect(bar.getByTestId('player-title')).toHaveText(c)
    await expect(page.getByText('Nothing up next')).toBeVisible()

    // The panel is modal: close it to use the library, then open it again.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('queue-list')).toBeHidden()
    await rowAction(page, b, 'Add to queue')
    await bar.getByTestId('player-queue').click()
    await expect(titles).toHaveText([b])
    await page.getByTestId('queue-clear').click()
    await expect(page.getByText('Nothing up next')).toBeVisible()
  })

  test('shuffle reorders the upcoming tracks and puts them back; repeat one restarts the track', async ({ page }) => {
    await signUp(page)
    // Five tracks named uniquely for this test. The default 3 seconds on purpose, unlike the test
    // above: playback is paused at once, and "repeat one" below needs the track to reach its end.
    const id = uniqueId()
    const titles = ['a', 'b', 'c', 'd', 'e'].map(letter => `s${letter}-${id}`)
    for (const title of titles) await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()

    // Newest first: playing the last upload leaves the other four, newest first, up next.
    const [first, ...rest] = [...titles].reverse() as [string, ...string[]]

    // Icon-only buttons name themselves in a tooltip; on a menu trigger the menu still opens.
    const actions = page.getByRole('button', { name: `Actions for ${first}` })
    await expectTooltip(page, actions, `Actions for ${first}`)
    await actions.click()
    await expect(page.getByRole('menuitem', { name: 'Play next' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('track-row').filter({ hasText: first }).getByTestId('track-title').click()
    // The player bar and its play button (the one on screen: phone and desktop have their own).
    const bar = page.getByTestId('player-bar')
    const toggle = bar.locator('[data-testid="player-toggle"]:visible')
    await expect(toggle).toHaveAttribute('aria-label', 'Pause')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', 'Play')
    // The bar's buttons name themselves too (before the Up next panel: closing it gives the focus
    // back to its button, which then shows its own tooltip, as keyboard users expect).
    await expectTooltip(page, bar.getByTestId('player-shuffle'), 'Shuffle: off')

    /** The Up next titles, read from the panel (opened, then closed again). */
    const upNext = async () => {
      await bar.getByTestId('player-queue').click()
      // The titles listed in Up next, and their text.
      const items = page.getByTestId('queue-item-title')
      await expect(items).toHaveCount(rest.length)
      // Their text.
      const texts = await items.allTextContents()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('queue-list')).toBeHidden()
      return texts.map(text => text.trim())
    }
    expect(await upNext()).toEqual(rest)

    // --- Shuffle: the same tracks in another order (4 tracks: 1 chance in 24 of the same order, so retry) ---
    const shuffleButton = bar.getByTestId('player-shuffle')
    let shuffledOrder = rest
    for (let attempt = 0; attempt < 5 && shuffledOrder.join() === rest.join(); attempt++) {
      if (attempt > 0) await shuffleButton.click()
      await shuffleButton.click()
      await expect(shuffleButton).toHaveAttribute('aria-label', 'Shuffle: on')
      shuffledOrder = await upNext()
    }
    expect(shuffledOrder).not.toEqual(rest)
    expect([...shuffledOrder].sort()).toEqual([...rest].sort())

    // --- Shuffle off: back in order ---
    await shuffleButton.click()
    await expect(shuffleButton).toHaveAttribute('aria-label', 'Shuffle: off')
    expect(await upNext()).toEqual(rest)

    // --- Repeat one: the 3-second track starts again instead of moving on ---
    const repeatButton = bar.getByTestId('player-repeat')
    await repeatButton.click()
    await repeatButton.click()
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat: one')
    await toggle.click()
    // The elapsed time, to see the track start again.
    const elapsed = bar.getByTestId('player-elapsed')
    await expect(elapsed).toHaveText('0:02')
    await expect(elapsed).toHaveText(/^0:0[01]$/)
    await expect(bar.getByTestId('player-title')).toHaveText(first)
    await expect(toggle).toHaveAttribute('aria-label', 'Pause')
    await toggle.click()

    // --- Tablet width: the bar keeps a real waveform (it used to shrink to nothing) ---
    await page.setViewportSize({ width: 820, height: 1180 })
    await expect(shuffleButton).toBeVisible()
    // Where the waveform is on a tablet-sized screen.
    const waveform = await bar.getByTestId('player-waveform').boundingBox()
    expect(waveform?.width).toBeGreaterThan(120)

    // --- The waveform sits above the controls, and their tooltips never catch its clicks ---
    const toggleBox = await toggle.boundingBox()
    expect(waveform!.y + waveform!.height).toBeLessThanOrEqual(toggleBox!.y)
    // Play's tooltip opens over the waveform; the waveform's middle, right
    // above the button, is inside it. Moving there must close it, so that a
    // click lands on the waveform and not on the tooltip.
    await expectTooltip(page, toggle, 'Play')
    // A point over the waveform, straight above the play button (where its tooltip would be).
    const x = toggleBox!.x + toggleBox!.width / 2
    const y = waveform!.y + waveform!.height / 2
    await page.mouse.move(x, y)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    // The element actually under that point.
    const hit = await page.evaluate(([px, py]) =>
      !!document.elementFromPoint(px!, py!)?.closest('[data-testid="player-waveform"]'), [x, y])
    expect(hit).toBe(true)
  })

  test('a long queue draws a hundred rows at a time; the last one drawn still moves down', async ({ page }) => {
    test.setTimeout(120_000)
    await signUp(page)
    // 250 tracks straight through the API: playing the first queues the other 249.
    await seedLibrary(page, 250)
    await page.goto('/')
    await page.getByTestId('track-row').first().getByTestId('track-title').click()
    // The seeded tracks last 0.1 s: "repeat one" keeps the queue still while the test reads it.
    // The player bar, and its repeat button (off → all → one).
    const bar = page.getByTestId('player-bar')
    const repeatButton = bar.getByTestId('player-repeat')
    await repeatButton.click()
    await repeatButton.click()
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat: one')

    await bar.getByTestId('player-queue').click()
    // The rows drawn, and the button that draws more.
    const rows = page.getByTestId('queue-item')
    const more = page.getByTestId('queue-show-more')
    await expect(rows).toHaveCount(100)
    // Upcoming tracks in all: the hundred drawn plus the ones the button announces.
    const announced = Number((await more.textContent())!.match(/\((\d+) more/)![1])
    const total = 100 + announced

    // The last row drawn moves down, past what is drawn: the next track takes its place.
    // The titles drawn, and the hundredth one, the last row before Show more.
    const titles = page.getByTestId('queue-item-title')
    const hundredth = (await titles.nth(99).textContent())!.trim()
    await page.getByRole('button', { name: `Queue actions for ${hundredth}` }).click()
    await page.getByRole('menuitem', { name: 'Move down' }).click()
    await expect(titles.nth(99)).not.toHaveText(hundredth)

    // A hundred more at each click, until every upcoming track is drawn.
    await more.click()
    await expect(rows).toHaveCount(Math.min(200, total))
    await expect(titles.nth(100)).toHaveText(hundredth)
    while (await more.isVisible()) await more.click()
    await expect(rows).toHaveCount(total)
  })
})
