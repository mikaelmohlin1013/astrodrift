import { UPGRADES, blocker, type Save, type Upgrade } from './upgrades';

// The upgrade shop panel, opened by docking at a repair station or with U on
// the title screen. Arrow keys or WASD move around the grid of upgrades and
// Enter buys the selected one; clicking a card buys it too.
export class Shop {
  private panel = byId('shop');
  private heading = byId('shop-title');
  private service = byId('shop-service');
  private bank = byId('shop-bank');
  private list = byId('shop-list');
  private info = byId('shop-info');
  private prompt = byId('shop-prompt');
  private selected = 0;
  private cards: HTMLElement[] = [];

  /** Called with an upgrade when its card is clicked. */
  onPick: (u: Upgrade) => void = () => {};
  /** Called when the selection changes, so the info line can be refreshed. */
  onSelect: () => void = () => {};

  constructor() {
    this.cards = UPGRADES.map((u, i) => {
      const card = document.createElement('div');
      card.className = 'item';
      card.addEventListener('pointerenter', () => this.select(i));
      card.addEventListener('click', () => {
        this.select(i);
        this.onPick(u);
      });
      this.list.appendChild(card);
      return card;
    });
  }

  get isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  get current(): Upgrade {
    return UPGRADES[this.selected];
  }

  /** Opens the shop; `service` is the line saying what docking did, if anything. */
  open(save: Save, title: string, service: string, prompt: string): void {
    this.heading.textContent = title;
    this.service.textContent = service;
    this.service.classList.toggle('hidden', !service);
    this.prompt.textContent = prompt;
    this.render(save);
    this.panel.classList.remove('hidden');
  }

  close(): void {
    this.panel.classList.add('hidden');
  }

  /** Moves the selection by `dx` columns and `dy` rows of the two-column grid. */
  move(dx: number, dy: number): void {
    const cols = getComputedStyle(this.list).gridTemplateColumns.split(' ').length;
    const n = UPGRADES.length;
    this.select((this.selected + dx + dy * cols + n) % n);
  }

  render(save: Save): void {
    this.bank.innerHTML = `<span class="gem">◆</span> ${save.bank} crystals to spend`;
    UPGRADES.forEach((u, i) => {
      const level = save.levels[u.id];
      const max = u.prices.length;
      const why = blocker(save, u);
      const next = level < max ? `${u.show(u.values[level])} → ${u.show(u.values[level + 1])}` : u.show(u.values[level]);
      const pips = '●'.repeat(level) + '○'.repeat(max - level);
      const price = level < max ? `<span class="gem">◆</span> ${u.prices[level]}` : 'MAX';
      const card = this.cards[i];
      card.className = `item${i === this.selected ? ' sel' : ''}${level >= max ? ' maxed' : why ? ' cant' : ''}`;
      card.innerHTML = `<span class="name">${u.name} <span class="pips">${pips}</span></span><span class="price">${price}</span><span class="desc">${next}</span>`;
    });
    const u = this.current;
    const why = blocker(save, u);
    this.info.textContent = why && why !== 'Not enough crystals' ? `${u.blurb} · ${why}` : u.blurb;
  }

  /** Shakes the selected card when it can't be bought. */
  deny(): void {
    const card = this.cards[this.selected];
    card.classList.remove('deny');
    void card.offsetWidth;
    card.classList.add('deny');
  }

  private select(i: number): void {
    if (i === this.selected) return;
    this.cards[this.selected].classList.remove('sel');
    this.selected = i;
    this.cards[i].classList.add('sel');
    this.onSelect();
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}
