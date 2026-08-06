# Design Guidelines: Fincai - Lux Black & Gold Design System

## Design Approach

**Selected System**: Lux Black & Gold Design System  
**Inspiration**: Sacred Geometry Logo with Gold Chrome Accents  
**References**: Robinhood iOS App, Linear (clean productivity UI), Stripe (typography), Luxury Fintech Brands

**Core Principles**:
- **Pure Black Foundation** - True black (#000000) for maximum contrast and premium feel
- **Gold Chrome Accents** - Metallic gold gradient for primary actions and branding
- **Radical Simplicity** - Remove everything that doesn't serve the user
- **Generous Whitespace** - Let content breathe with intentional negative space
- **Data-First Hierarchy** - Financial numbers are the hero

---

## Gold Chrome Color System

### Primary Gold Colors (Extracted from Sacred Geometry Logo)

| Token | Name | Value | HSL | Usage |
|-------|------|-------|-----|-------|
| `--gold-primary` | Chrome Gold | `#D4AF37` | 46 65% 52% | Primary actions, CTAs, brand |
| `--gold-dark` | Deep Bronze | `#8B6914` | 43 75% 31% | Shadow states, pressed |
| `--gold-light` | Highlight Gold | `#FFD700` | 51 100% 50% | Hover states, glows |
| `--gold-ambient` | Soft Gold | `#B68F2A` | 44 63% 43% | Gradients, ambient glow |

### Gold Gradient (CTA Buttons)

```css
background: linear-gradient(135deg, 
  hsl(43 75% 31%),   /* Deep Bronze */
  hsl(46 65% 52%),   /* Chrome Gold */
  hsl(51 100% 50%)   /* Highlight Gold */
);
```

### Semantic Financial Colors

| Token | Name | Value | Usage |
|-------|------|-------|-------|
| `--profit` | Verdant Surge | `#13C48B` (158 82% 44%) | Gains, positive changes |
| `--profit-muted` | Soft Profit | 158 45% 18% | Background for profit badges |
| `--loss` | Ember Risk | `#FF6155` (4 100% 66%) | Losses, warnings |
| `--loss-muted` | Soft Loss | 7 65% 18% | Background for loss badges |

### Surface Colors (Pure Black Theme)

| Token | Name | Value | Usage |
|-------|------|-------|-------|
| `--background` | Pure Black | `#000000` (0 0% 0%) | App background |
| `--card` | Elevated Black | (0 0% 5%) | Cards, panels |
| `--sidebar` | Deep Black | (0 0% 3%) | Sidebar background |
| `--muted` | Dark Surface | (0 0% 12%) | Interactive hover |

### Text Hierarchy

| Token | Usage | Value |
|-------|-------|-------|
| `--foreground` | Headlines, primary content | 0 0% 94% (near-white) |
| `--muted-foreground` | Body text, descriptions | 0 0% 55% |
| `--gold-primary` | Accent text, links | 46 65% 52% |

### Glass Effects (Gold-Tinted)

| Token | Value | Usage |
|-------|-------|-------|
| `--glass-chat` | `rgba(0, 0, 0, 0.85)` | Chat overlays |
| `--glass-border` | `rgba(212, 175, 55, 0.12)` | Gold-tinted borders |
| `--glass-glow` | `rgba(212, 175, 55, 0.16)` | Hover borders |
| `--glass-blur` | `blur(20px) saturate(180%)` | Backdrop filter |
| `--glass-message-user` | `rgba(212, 175, 55, 0.08)` | User message bubbles |

---

## Typography System

### Font Stack

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-display: 'Inter' (for headlines);
--font-mono: 'Space Grotesk', 'SF Mono', monospace (for financial data);
```

### Type Scale

| Size | Value | Usage |
|------|-------|-------|
| `text-xs` | 11px | Micro labels, timestamps |
| `text-sm` | 13px | Secondary text, captions |
| `text-base` | 15px | Body text, UI elements |
| `text-lg` | 17px | Emphasis, subheadings |
| `text-xl` | 20px | Section titles |
| `text-2xl` | 24px | Page headings |
| `text-3xl` | 32px | Hero values |
| `text-4xl` | 48px | Portfolio totals |

### Financial Typography

**Critical**: All financial numbers use `font-mono` with `tabular-nums`:

```css
.price-hero     /* 48px, -0.03em tracking */
.price-large    /* 24px, -0.02em tracking */
.price-medium   /* 18px, -0.01em tracking */
.price-small    /* 14px, standard tracking */
.percent-change /* 13px, with muted background */
```

---

## Spacing System

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight gaps, icon padding |
| `--space-2` | 8px | List item gaps |
| `--space-3` | 12px | Component internal spacing |
| `--space-4` | 16px | Card padding, section gaps |
| `--space-6` | 24px | Large sections |
| `--space-8` | 32px | Page sections |
| `--space-12` | 48px | Hero spacing |

### Tailwind Usage

- Component padding: `p-4` (16px)
- Section gaps: `gap-6` (24px)
- Card spacing: `space-y-4`
- Mobile bottom: `pb-20` for navigation

---

## Shadow & Depth System

### Philosophy

- **Minimal shadows by default** - only on elevation
- **Gold-tinted borders** - `rgba(212, 175, 55, 0.12)`
- **Gold glow effects** - for premium interactions

### Shadow Scale

| Token | Usage |
|-------|-------|
| `--shadow-sm` | Subtle lift |
| `--shadow-md` | Floating elements |
| `--shadow-lg` | Modals, dropdowns |
| `--shadow-xl` | Hero elements |

### Glow Effects

```css
--glow-profit: 0 0 20px rgba(19, 196, 139, 0.35);
--glow-loss: 0 0 20px rgba(255, 97, 85, 0.35);
--glow-primary: 0 0 24px rgba(212, 175, 55, 0.35);
--glow-gold: 0 0 30px rgba(255, 215, 0, 0.25);
```

---

## Component Styling

### Cards (Black with Gold Borders)

```css
.card-minimal {
  background: hsl(var(--card));  /* 0 0% 5% */
  border: 1px solid var(--glass-border);  /* Gold-tinted */
  border-radius: var(--radius-lg);  /* 16px */
  padding: var(--space-4);
}

/* Hover: gold border glow */
.card-minimal:hover {
  border-color: var(--glass-glow);
}
```

### Buttons

**Primary (Gold Chrome):**
```css
.btn-gold {
  background: linear-gradient(135deg, 
    hsl(var(--gold-dark)), 
    hsl(var(--gold-primary)), 
    hsl(var(--gold-light))
  );
  color: hsl(0 0% 5%);  /* Dark text for contrast */
  border: 1px solid hsl(var(--gold-light) / 0.3);
}

.btn-gold:hover {
  box-shadow: var(--glow-gold);
  transform: translateY(-1px);
}
```

**Ghost (Gold Outline):**
```css
.btn-ghost-gold {
  background: transparent;
  color: hsl(var(--gold-primary));
  border: 1px solid hsl(var(--gold-primary) / 0.3);
}

.btn-ghost-gold:hover {
  background: hsl(var(--gold-primary) / 0.1);
  border-color: hsl(var(--gold-primary) / 0.5);
}
```

### Glass Panels

```css
.glass-panel {
  background: var(--glass-chat);  /* Black with transparency */
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--glass-border);  /* Gold-tinted */
  border-radius: var(--radius-lg);
}
```

### Inputs

- Clean, minimal border with gold tint
- Focus: Gold border + subtle gold glow ring
- No heavy shadows

---

## Animation Guidelines

### Timing Functions

| Token | Curve | Usage |
|-------|-------|-------|
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Page transitions |
| `--ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | UI interactions |
| `--spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful elements |

### Duration Scale

| Token | Duration | Usage |
|-------|----------|-------|
| `--duration-fast` | 100ms | Micro-interactions |
| `--duration-base` | 200ms | Standard transitions |
| `--duration-slow` | 300ms | Complex animations |

### Animation Classes

```css
.animate-fade-in-up    /* Entry animations */
.animate-scale-in      /* Modal/dropdown entry */
.animate-value-update  /* Price changes */
.stagger-item          /* List item stagger */
```

---

## Mobile-First Architecture

### Navigation

**Mobile (< 768px):**
- 5-tab bottom navigation
- 48px minimum touch targets
- Safe area padding for iOS

**Desktop (≥ 768px):**
- Collapsible sidebar
- Slide-out toggle menu (immersive page)

### Touch Targets

- Minimum: 44pt (48px)
- `min-h-[48px]` for all buttons
- `touch-manipulation` for improved response

### Responsive Breakpoints

```css
--breakpoint-sm: 640px
--breakpoint-md: 768px
--breakpoint-lg: 1024px
--breakpoint-xl: 1280px
```

---

## Accessibility Standards

- **Focus States**: Visible gold focus rings on all interactive elements
- **Color Contrast**: WCAG AA compliant (4.5:1 for text) - Gold on black passes
- **Touch Targets**: 48px minimum
- **ARIA Labels**: All interactive elements
- **Keyboard Navigation**: Full support
- **Screen Reader**: Semantic HTML, live regions

---

## Data Visualization

### Charts

- Clean lines, minimal chrome
- Use Recharts library
- Gold gradient for primary data
- Profit/Loss colors preserved for semantic meaning
- Grid: subtle gold tint, not distracting

### Chart Color Palette

```css
--chart-1: 46 65% 52%;   /* Primary Gold */
--chart-2: 51 100% 50%;  /* Highlight Gold */
--chart-3: 43 75% 40%;   /* Deep Bronze */
--chart-4: 38 90% 45%;   /* Amber */
--chart-5: 32 85% 50%;   /* Orange Gold */
```

### Financial Data

- Right-aligned numerical columns
- Monospace font for alignment
- Color-coded profit/loss
- Compact row height (40-48px)

---

## Key Design Decisions

1. **Pure black background** - True #000000 for maximum premium feel
2. **Gold chrome primary** - Luxury metallic gradient for brand identity
3. **Dark mode only** - Optimized for extended trading sessions
4. **Data density > whitespace** - Traders need information
5. **Speed > beauty** - Instant feedback on all interactions
6. **Precision > approximation** - Exact numbers, aligned columns
7. **Minimal > decorative** - Every element serves a purpose

---

## CSS Utility Classes

### Gold Colors
- `text-gold` / `text-gold-light`
- `btn-gold` / `btn-ghost-gold`
- `glow-gold`

### Financial Colors
- `text-profit` / `text-loss`
- `bg-profit-muted` / `bg-loss-muted`
- `glow-profit` / `glow-loss`

### Glass Effects
- `glass-chat` / `glass-header` / `glass-input`
- `glass-panel` / `glass-panel-elevated`
- `glass-message-user` / `glass-message-assistant`

### Typography
- `font-display` / `font-financial`
- `price-hero` / `price-large` / `price-medium` / `price-small`
- `percent-change-profit` / `percent-change-loss`

### Animations
- `animate-fade-in` / `animate-fade-in-up` / `animate-scale-in`
- `animate-value-update` / `animate-pulse-subtle`
- `stagger-item` (nth-child delay built-in)

### Layout
- `hide-scrollbar`
- `quick-chips-scroll`
- `safe-area-bottom`
