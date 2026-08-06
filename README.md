# AI Finance Officer

An AI-powered day trading assistant with a ChatGPT-style conversational interface, live market data visualization, and comprehensive portfolio management tools.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.6-blue.svg)

## Overview

AI Finance Officer is a sophisticated trading platform that combines conversational AI with real-time market analysis. Users can interact naturally with Claude AI to execute trades, analyze options strategies, and track portfolio performance—all while viewing live SPY price charts as a dynamic backdrop.

### Key Highlights

- **Natural Language Trading**: Execute buy/sell orders through conversation (e.g., "Buy 100 shares of AAPL")
- **Live Market Visualization**: Real-time SPY price chart displayed as an ambient background
- **AI-Powered Analysis**: Get instant market insights, strategy recommendations, and risk assessments
- **Professional Tools**: Full suite of technical analysis and options trading capabilities

## Features

### Core Trading Features

- **Real-time Market Data** - WebSocket-powered live price updates for stocks and indices
- **AI Trading Assistant** - Claude AI integration for conversational portfolio management
- **Portfolio Management** - Track positions, P&L, and execute trades through natural language
- **Trade Journal** - Document trades with emotion tracking and performance notes

### Technical Analysis Tools

- **Pivot Points Calculator** - Standard, Fibonacci, and Woodie's pivot calculations
- **Fibonacci Retracements** - Automated support/resistance level identification
- **ATR (Average True Range)** - Volatility measurement for position sizing
- **Bollinger Bands** - Price envelope analysis with customizable parameters
- **VIX Integration** - Real-time volatility index monitoring

### Options Trading Suite

- **Options Strategy Analyzer** - Build and analyze multi-leg options strategies
- **Greeks Calculator** - Real-time Delta, Gamma, Theta, Vega, and Rho calculations
- **Payoff Diagrams** - Visual profit/loss curves for strategy analysis
- **Position Sizing Calculator** - Risk-based position sizing recommendations

### Trading Psychology

- **Psychology Tracker** - Monitor emotional states and their impact on trading
- **Performance Dashboard** - Comprehensive trading metrics and analytics
- **Pattern Recognition** - Identify behavioral patterns affecting performance

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| React 18 | UI Framework |
| TypeScript | Type Safety |
| Vite | Build Tool & Dev Server |
| TailwindCSS | Styling |
| Shadcn/ui | Component Library |
| TanStack Query | Data Fetching & Caching |
| Wouter | Routing |
| Recharts | Data Visualization |
| Framer Motion | Animations |

### Backend

| Technology | Purpose |
|------------|---------|
| Express.js | HTTP Server |
| TypeScript | Type Safety |
| WebSocket (ws) | Real-time Data |
| Drizzle ORM | Database Access |
| Zod | Schema Validation |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| PostgreSQL | Database (Supabase/Neon) |
| Anthropic Claude | AI Integration |
| Alpha Vantage | Market Data API |

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher)
- **npm** (v9+) or **pnpm** (v8+)
- **PostgreSQL** database (Supabase recommended for quick setup)

### Required API Keys

1. **Anthropic API Key** - For Claude AI integration ([Get one here](https://console.anthropic.com/))
2. **Alpha Vantage API Key** - For market data ([Get one here](https://www.alphavantage.co/support/#api-key))

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/ai-finance-officer.git
cd ai-finance-officer
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [Environment Variables](#environment-variables) section).

### 4. Set Up the Database

Push the schema to your PostgreSQL database:

```bash
npm run db:push
```

### 5. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5000`.

## Environment Variables

Create a `.env` file based on `.env.example` with the following variables:

### Backend Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude AI | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for admin operations) | Yes |
| `SESSION_SECRET` | Random string for session encryption | Yes |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage API key for market data | Yes |
| `NODE_ENV` | Environment mode (`development` or `production`) | No |
| `PORT` | Server port (default: 5000) | No |

### Frontend Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_BASE_URL` | Backend API URL (e.g., `http://localhost:5000`) | No |
| `VITE_SUPABASE_URL` | Supabase project URL (frontend-safe) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key (frontend-safe) | Yes |

## Project Structure

```
ai-finance-officer/
├── client/                    # React frontend application
│   ├── public/               # Static assets
│   └── src/
│       ├── components/       # Reusable UI components
│       │   ├── chat/        # Chat interface components
│       │   ├── market/      # Market data visualization
│       │   ├── portfolio/   # Portfolio management
│       │   └── ui/          # Shadcn/ui components
│       ├── hooks/           # Custom React hooks
│       ├── lib/             # Utility functions
│       └── pages/           # Route pages
│           ├── ai-trader.tsx           # Main AI chat interface
│           ├── dashboard.tsx           # Market overview
│           ├── strategy-builder.tsx    # Options strategy builder
│           ├── market-analysis.tsx     # Technical analysis tools
│           ├── trade-journal.tsx       # Trade logging
│           ├── psychology-tracker.tsx  # Trading psychology
│           └── ...
├── server/                   # Express backend
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # API route definitions
│   ├── storage.ts           # Database operations
│   ├── anthropic.ts         # Claude AI integration
│   ├── alpha-vantage.ts     # Market data service
│   ├── greeks-calculator.ts # Options Greeks calculations
│   └── strategy-analyzer.ts # Strategy analysis logic
├── shared/                   # Shared code between frontend/backend
│   └── schema.ts            # Database schema & TypeScript types
├── .env.example             # Environment variables template
├── drizzle.config.ts        # Drizzle ORM configuration
├── package.json             # Project dependencies
├── tailwind.config.ts       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── vite.config.ts           # Vite build configuration
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production (frontend + backend) |
| `npm run start` | Run production build |
| `npm run check` | Run TypeScript type checking |
| `npm run db:push` | Push Drizzle schema changes to database |

## API Endpoints

### Market Data

- `GET /api/market/summary` - Get summary for QQQ, WMT, SPY, VIX
- `GET /api/market/quote/:symbol` - Get quote for a specific symbol
- `GET /api/market/quotes?symbols=AAPL,MSFT` - Get multiple quotes

### Portfolio Management

- `GET /api/portfolios/:id` - Get portfolio with holdings
- `POST /api/portfolios/:id/buy` - Execute buy order
- `POST /api/portfolios/:id/sell` - Execute sell order
- `GET /api/portfolios/:id/orders` - Get trade history

### AI Chat

- `POST /api/chat` - Send message and receive AI response (streaming)
- `GET /api/conversations` - List all conversations
- `GET /api/conversations/:id/messages` - Get conversation messages

### Options Strategies

- `GET /api/strategies` - List all strategies
- `POST /api/strategies` - Create new strategy
- `POST /api/strategies/:id/analyze` - Analyze strategy with Greeks

### Technical Analysis

- `POST /api/analysis/pivot-points` - Calculate pivot points
- `POST /api/analysis/fibonacci` - Calculate Fibonacci levels
- `POST /api/analysis/atr` - Calculate ATR
- `POST /api/analysis/bollinger-bands` - Calculate Bollinger Bands

## Deployment

This application can be deployed to various platforms:

### Replit (Recommended)

The project is configured for seamless Replit deployment. Simply:
1. Import the repository to Replit
2. Configure secrets in the Secrets tab
3. Click "Run"

### Other Platforms

For deployment to platforms like Railway, Render, or Vercel, see `DEPLOYMENT.md` for detailed instructions.

### Production Considerations

- Set `NODE_ENV=production`
- Use a managed PostgreSQL service (Supabase, Neon, or Railway)
- Configure proper session secrets
- Set up SSL/TLS for secure connections
- Consider rate limiting for API endpoints

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with Claude AI and modern web technologies.
