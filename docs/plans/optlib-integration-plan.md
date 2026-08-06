# Integration Plan: optlib Options Pricing for Fincai.ai

**Fincai.ai appears to be a new or private trading platform** not yet publicly indexed, presenting an ideal opportunity to architect options pricing capabilities from the ground up. The **optlib library provides a comprehensive, MIT-licensed foundation** with Black-Scholes variants, American option pricing via Bjerksund-Stensland, Asian options, spread options, full Greeks calculations, and implied volatility solvers—all built on the standard NumPy/SciPy stack.

This implementation plan structures a phased approach to integrate optlib's capabilities into a modern trading platform, with architecture optimized for Replit development and Claude Opus 4.5 code generation.

---

## optlib capabilities summary

The library delivers **8 distinct pricing models** covering stocks, indices, commodities, and FX options. Every European model returns a complete array of `[Value, Delta, Gamma, Theta, Vega, Rho]`, enabling real-time risk dashboards. American options use the **Bjerksund-Stensland 2002 closed-form approximation**—faster than binomial trees while maintaining reasonable accuracy. Key limitations include no barrier options, no digital options, and approximate Greeks for American-style instruments.

The TDAmeritrade API module (now defunct post-Schwab merger) demonstrates integration patterns that translate directly to Alpaca's options data API.

---

## Implementation plan JSON

```json
{
  "project_metadata": {
    "name": "fincai-options-integration",
    "version": "1.0.0",
    "description": "optlib integration for Fincai.ai options pricing platform",
    "target_environment": "Replit",
    "ai_assistant": "Claude Opus 4.5",
    "license": "MIT"
  },

  "phase_1_foundation": {
    "timeline": "Weeks 1-3",
    "priority": "CRITICAL",
    "objective": "Core pricing engine and basic API",
    
    "modules": {
      "pricing_engine": {
        "path": "backend/services/pricing_engine.py",
        "description": "Wrapper around optlib with standardized interfaces",
        "implementation": {
          "classes": [
            {
              "name": "OptionPricer",
              "methods": [
                "price_european(option_type, spot, strike, expiry_days, rate, volatility, dividend_yield=0)",
                "price_american(option_type, spot, strike, expiry_days, rate, volatility, dividend_yield=0)",
                "price_commodity(option_type, forward_price, strike, expiry_days, rate, volatility)",
                "price_fx(option_type, spot, strike, expiry_days, domestic_rate, foreign_rate, volatility)"
              ],
              "optlib_mapping": {
                "price_european": "optlib.merton()",
                "price_american": "optlib.american()",
                "price_commodity": "optlib.black_76()",
                "price_fx": "optlib.garman_kohlhagen()"
              }
            },
            {
              "name": "GreeksCalculator",
              "methods": [
                "calculate_all(option_params) -> {delta, gamma, theta, vega, rho}",
                "calculate_portfolio_greeks(positions_list) -> aggregated_greeks",
                "theta_daily(annualized_theta) -> theta / 365"
              ],
              "notes": "optlib returns [value, delta, gamma, theta, vega, rho] array - parse indices"
            },
            {
              "name": "ImpliedVolatilitySolver",
              "methods": [
                "solve_european_iv(option_type, spot, strike, expiry, rate, market_price, dividend_yield=0)",
                "solve_american_iv(option_type, spot, strike, expiry, rate, market_price, dividend_yield=0)",
                "build_volatility_surface(option_chain_data)"
              ],
              "optlib_mapping": {
                "solve_european_iv": "optlib.euro_implied_vol()",
                "solve_american_iv": "optlib.amer_implied_vol()"
              }
            }
          ]
        }
      },

      "alpaca_integration": {
        "path": "backend/services/alpaca_client.py",
        "description": "Alpaca API wrapper for options data and trading",
        "implementation": {
          "classes": [
            {
              "name": "AlpacaOptionsClient",
              "methods": [
                "get_option_chain(underlying_symbol, expiration_date=None)",
                "get_option_quote(option_symbol)",
                "get_option_greeks(option_symbol)",
                "stream_option_quotes(symbols_list, callback)",
                "get_historical_options(symbol, start_date, end_date)"
              ],
              "api_endpoints": {
                "option_chain": "GET /v2/options/contracts",
                "option_quote": "GET /v2/options/contracts/{symbol}",
                "market_data": "wss://stream.data.alpaca.markets/v1beta1/options"
              },
              "authentication": {
                "method": "API Key + Secret",
                "headers": ["APCA-API-KEY-ID", "APCA-API-SECRET-KEY"],
                "base_url_paper": "https://paper-api.alpaca.markets",
                "base_url_live": "https://api.alpaca.markets"
              }
            }
          ],
          "data_models": [
            {
              "name": "OptionContract",
              "fields": ["symbol", "underlying", "type", "strike", "expiration", "style"]
            },
            {
              "name": "OptionQuote",
              "fields": ["bid", "ask", "last", "volume", "open_interest", "iv", "greeks"]
            }
          ]
        }
      },

      "api_routes": {
        "path": "backend/api/options_routes.py",
        "framework": "FastAPI",
        "endpoints": [
          {
            "route": "POST /api/v1/options/price",
            "description": "Calculate theoretical option price",
            "request_body": {
              "option_type": "call|put",
              "underlying_price": "float",
              "strike": "float",
              "days_to_expiry": "int",
              "volatility": "float",
              "risk_free_rate": "float",
              "dividend_yield": "float (optional)",
              "model": "european|american|commodity"
            },
            "response": {
              "price": "float",
              "greeks": {"delta": "float", "gamma": "float", "theta": "float", "vega": "float", "rho": "float"}
            }
          },
          {
            "route": "POST /api/v1/options/iv",
            "description": "Calculate implied volatility from market price",
            "request_body": {
              "option_type": "call|put",
              "underlying_price": "float",
              "strike": "float",
              "days_to_expiry": "int",
              "market_price": "float",
              "risk_free_rate": "float"
            },
            "response": {"implied_volatility": "float"}
          },
          {
            "route": "GET /api/v1/options/chain/{symbol}",
            "description": "Get option chain with calculated Greeks",
            "query_params": ["expiration", "strike_range", "include_greeks"],
            "data_source": "Alpaca API + optlib calculations"
          }
        ]
      }
    },

    "dependencies": {
      "python": ">=3.8",
      "packages": {
        "optlib": "git+https://github.com/dbrojas/optlib.git",
        "numpy": ">=1.21.0",
        "scipy": ">=1.7.0",
        "pandas": ">=1.3.0",
        "requests": ">=2.26.0",
        "fastapi": ">=0.68.0",
        "uvicorn": ">=0.15.0",
        "alpaca-py": ">=0.13.0",
        "python-dotenv": ">=0.19.0",
        "pydantic": ">=1.8.0"
      }
    },

    "setup_steps": [
      "1. Create Replit Python project",
      "2. Add requirements.txt with dependencies",
      "3. Clone optlib: pip install git+https://github.com/dbrojas/optlib.git",
      "4. Configure .env with ALPACA_API_KEY and ALPACA_SECRET_KEY",
      "5. Create directory structure: backend/{api,services,models}",
      "6. Implement pricing_engine.py wrapping optlib functions",
      "7. Implement alpaca_client.py for market data",
      "8. Create FastAPI application with routes",
      "9. Test with paper trading credentials"
    ],

    "deliverables": [
      "Working options pricing API",
      "Greeks calculation endpoint",
      "Implied volatility solver",
      "Alpaca option chain integration",
      "Basic error handling and validation"
    ]
  },

  "phase_2_analytics": {
    "timeline": "Weeks 4-6",
    "priority": "HIGH",
    "objective": "Advanced analytics and visualization dashboards",
    
    "modules": {
      "volatility_analysis": {
        "path": "backend/services/volatility_analyzer.py",
        "features": [
          {
            "name": "VolatilitySurface",
            "description": "3D volatility surface from option chain IV",
            "methods": [
              "build_surface(option_chain, interpolation='cubic')",
              "get_iv_at_strike_expiry(strike, days_to_expiry)",
              "detect_skew_pattern()"
            ]
          },
          {
            "name": "HistoricalVolatility",
            "description": "Calculate realized volatility from price history",
            "methods": [
              "calculate_hv(prices, window=30)",
              "volatility_cone(prices, percentiles=[10,25,50,75,90])",
              "iv_hv_ratio(implied_vol, historical_vol)"
            ]
          }
        ]
      },

      "strategy_analyzer": {
        "path": "backend/services/strategy_analyzer.py",
        "features": [
          {
            "name": "StrategyBuilder",
            "supported_strategies": [
              "covered_call",
              "protective_put",
              "bull_call_spread",
              "bear_put_spread",
              "iron_condor",
              "straddle",
              "strangle",
              "butterfly",
              "calendar_spread"
            ],
            "methods": [
              "build_strategy(legs_config) -> Strategy",
              "calculate_payoff_diagram(strategy, price_range)",
              "calculate_strategy_greeks(strategy)",
              "calculate_break_even_points(strategy)",
              "max_profit_loss(strategy)"
            ]
          },
          {
            "name": "ProfitLossSimulator",
            "methods": [
              "simulate_pnl_over_time(strategy, days_forward, vol_scenarios)",
              "monte_carlo_pnl(strategy, simulations=10000)",
              "what_if_analysis(strategy, price_change, vol_change, time_decay)"
            ]
          }
        ]
      },

      "dashboard_components": {
        "path": "frontend/components/options/",
        "framework": "React + TypeScript",
        "components": [
          {
            "name": "OptionsChainTable",
            "file": "OptionsChainTable.tsx",
            "features": ["Strike ladder", "Call/Put columns", "Greeks display", "IV column", "Volume/OI", "Color-coded ITM/OTM"]
          },
          {
            "name": "GreeksDashboard",
            "file": "GreeksDashboard.tsx",
            "features": ["Portfolio Greeks summary", "Delta exposure chart", "Gamma exposure by strike", "Theta decay visualization", "Vega sensitivity"]
          },
          {
            "name": "PayoffDiagram",
            "file": "PayoffDiagram.tsx",
            "features": ["Interactive P/L chart", "Multiple expiration overlays", "Break-even markers", "Current price indicator"],
            "library": "Recharts or Victory"
          },
          {
            "name": "VolatilitySurfaceChart",
            "file": "VolatilitySurfaceChart.tsx",
            "features": ["3D surface plot", "Strike x Expiry x IV", "Skew visualization"],
            "library": "Plotly.js"
          },
          {
            "name": "OptionCalculator",
            "file": "OptionCalculator.tsx",
            "features": ["Input form for parameters", "Real-time price/Greeks calculation", "Compare theoretical vs market", "IV solver input"]
          }
        ]
      }
    },

    "api_extensions": [
      {
        "route": "POST /api/v1/options/strategy/analyze",
        "description": "Analyze multi-leg option strategy",
        "request_body": {
          "legs": [
            {"action": "buy|sell", "option_type": "call|put", "strike": "float", "expiry": "date", "quantity": "int"}
          ],
          "underlying_price": "float"
        },
        "response": {
          "max_profit": "float|unlimited",
          "max_loss": "float|unlimited",
          "break_even_points": ["float"],
          "net_premium": "float",
          "greeks": {},
          "payoff_data": [{"price": "float", "pnl": "float"}]
        }
      },
      {
        "route": "GET /api/v1/options/volatility/surface/{symbol}",
        "description": "Get volatility surface data for visualization",
        "response": {
          "surface_data": [{"strike": "float", "expiry_days": "int", "iv": "float"}],
          "atm_iv": "float",
          "skew_metrics": {}
        }
      }
    ],

    "deliverables": [
      "Volatility surface calculator and visualization",
      "Multi-leg strategy analyzer",
      "P/L diagram generator",
      "Greeks aggregation for portfolios",
      "React dashboard components"
    ]
  },

  "phase_3_advanced": {
    "timeline": "Weeks 7-10",
    "priority": "MEDIUM",
    "objective": "Advanced features, education, and risk management",
    
    "modules": {
      "exotic_options": {
        "path": "backend/services/exotic_pricer.py",
        "description": "Extended pricing beyond core optlib",
        "features": [
          {
            "name": "AsianOptionPricer",
            "description": "Already in optlib via asian_76()",
            "methods": ["price_asian_commodity(fs, x, t, t_a, r, v)"],
            "notes": "t_a = time to averaging start; invalid during averaging period"
          },
          {
            "name": "SpreadOptionPricer",
            "description": "Kirk's approximation from optlib",
            "methods": ["price_spread(f1, f2, x, t, r, v1, v2, correlation)"],
            "use_cases": ["Crack spreads", "Calendar spreads", "Heat rate options"]
          },
          {
            "name": "BarrierOptionPricer",
            "description": "Custom implementation (not in optlib)",
            "types": ["knock_in_call", "knock_out_call", "knock_in_put", "knock_out_put"],
            "methods": ["price_barrier(barrier_type, barrier_level, ...params)"],
            "implementation_notes": "Requires custom Black-Scholes variant with barrier terms"
          }
        ]
      },

      "risk_management": {
        "path": "backend/services/risk_manager.py",
        "features": [
          {
            "name": "PortfolioRiskAnalyzer",
            "methods": [
              "calculate_var(portfolio, confidence=0.95, horizon_days=1)",
              "calculate_expected_shortfall(portfolio, confidence=0.95)",
              "stress_test(portfolio, scenarios)",
              "correlation_analysis(positions)"
            ]
          },
          {
            "name": "PositionLimits",
            "methods": [
              "check_delta_limit(portfolio, max_delta)",
              "check_gamma_limit(portfolio, max_gamma)",
              "check_vega_limit(portfolio, max_vega)",
              "margin_requirement_estimate(positions)"
            ]
          },
          {
            "name": "AlertSystem",
            "methods": [
              "set_greek_threshold_alert(greek, threshold, direction)",
              "set_pnl_alert(threshold)",
              "set_iv_change_alert(symbol, percentage_change)"
            ]
          }
        ]
      },

      "educational_features": {
        "path": "frontend/components/education/",
        "features": [
          {
            "name": "OptionsBasicsTutorial",
            "topics": [
              "What are options?",
              "Calls vs Puts",
              "Strike price and expiration",
              "Intrinsic vs extrinsic value",
              "Time decay explained"
            ]
          },
          {
            "name": "GreeksVisualizer",
            "description": "Interactive Greek exploration",
            "features": [
              "Delta: Stock position equivalent slider",
              "Gamma: Delta change visualization",
              "Theta: Time decay curve animation",
              "Vega: IV change impact demo",
              "Rho: Interest rate sensitivity"
            ]
          },
          {
            "name": "StrategyPlayground",
            "description": "Paper trade strategies with real-time feedback",
            "features": [
              "Build multi-leg strategies visually",
              "See P/L update in real-time",
              "Compare to market prices",
              "Historical strategy backtesting"
            ]
          },
          {
            "name": "VolatilitySchool",
            "topics": [
              "Implied vs Historical volatility",
              "Volatility smile and skew",
              "Term structure",
              "Vol trading strategies",
              "IV rank and percentile"
            ]
          }
        ]
      },

      "paper_trading": {
        "path": "backend/services/paper_trading.py",
        "description": "Simulated options trading for education",
        "features": [
          {
            "name": "PaperTradingEngine",
            "methods": [
              "create_account(initial_balance=100000)",
              "place_order(account_id, order_details)",
              "get_positions(account_id)",
              "get_pnl_history(account_id)",
              "reset_account(account_id)"
            ],
            "order_types": ["market", "limit", "stop"],
            "position_tracking": "Uses optlib for real-time P/L based on current Greeks"
          }
        ]
      }
    },

    "deliverables": [
      "Asian and spread option pricing UI",
      "Portfolio VaR and risk metrics",
      "Position limit monitoring",
      "Educational interactive tutorials",
      "Paper trading system"
    ]
  },

  "architecture": {
    "backend": {
      "framework": "FastAPI",
      "language": "Python 3.10+",
      "structure": {
        "backend/": {
          "main.py": "FastAPI application entry point",
          "config.py": "Environment configuration",
          "api/": {
            "__init__.py": "",
            "options_routes.py": "Option pricing endpoints",
            "strategy_routes.py": "Strategy analysis endpoints",
            "market_data_routes.py": "Alpaca data endpoints"
          },
          "services/": {
            "__init__.py": "",
            "pricing_engine.py": "optlib wrapper",
            "alpaca_client.py": "Market data integration",
            "volatility_analyzer.py": "Vol surface and HV",
            "strategy_analyzer.py": "Multi-leg strategies",
            "risk_manager.py": "Risk calculations"
          },
          "models/": {
            "__init__.py": "",
            "option_models.py": "Pydantic models",
            "strategy_models.py": "Strategy definitions"
          }
        }
      }
    },

    "frontend": {
      "framework": "React 18 + TypeScript",
      "styling": "Tailwind CSS",
      "charts": "Recharts + Plotly.js",
      "state": "React Query for API calls",
      "structure": {
        "frontend/": {
          "src/": {
            "App.tsx": "Main application",
            "components/": {
              "options/": "Options-specific components",
              "charts/": "Visualization components",
              "education/": "Tutorial components",
              "common/": "Shared UI components"
            },
            "hooks/": {
              "useOptionPricing.ts": "Pricing API hook",
              "useAlpacaData.ts": "Market data hook"
            },
            "api/": {
              "optionsApi.ts": "API client functions"
            }
          }
        }
      }
    },

    "deployment": {
      "platform": "Replit",
      "configuration": {
        "replit.nix": {
          "deps": ["python-3.10", "nodejs-18", "postgresql"]
        },
        ".replit": {
          "run": "uvicorn backend.main:app --host 0.0.0.0 --port 8000",
          "entrypoint": "backend/main.py"
        }
      },
      "environment_variables": [
        "ALPACA_API_KEY",
        "ALPACA_SECRET_KEY",
        "ALPACA_BASE_URL",
        "DATABASE_URL (optional)"
      ]
    }
  },

  "optlib_specific_implementation": {
    "function_signatures": {
      "european_options": {
        "black_scholes": "black_scholes(option_type, fs, x, t, r, v) -> [value, delta, gamma, theta, vega, rho]",
        "merton": "merton(option_type, fs, x, t, r, q, v) -> [value, delta, gamma, theta, vega, rho]",
        "notes": "Use merton() for dividend-paying stocks; q = dividend yield"
      },
      "american_options": {
        "american": "american(option_type, fs, x, t, r, q, v) -> [value, delta, gamma, theta, vega, rho]",
        "american_76": "american_76(option_type, fs, x, t, r, v) -> [value, delta, gamma, theta, vega, rho]",
        "notes": "Bjerksund-Stensland 2002 approximation; Greeks are GBS approximated"
      },
      "commodity_options": {
        "black_76": "black_76(option_type, fs, x, t, r, v) -> [value, delta, gamma, theta, vega, rho]",
        "notes": "Uses forward price instead of spot; cost of carry b=0"
      },
      "exotic_options": {
        "asian_76": "asian_76(option_type, fs, x, t, t_a, r, v) -> [value, delta, gamma, theta, vega, rho]",
        "kirks_76": "kirks_76(option_type, f1, f2, x, t, r, v1, v2, corr) -> [value] (no Greeks)",
        "notes": "Asian: t_a = time to averaging start; Kirk's: spread options, no Greeks returned"
      },
      "implied_volatility": {
        "euro_implied_vol": "euro_implied_vol(option_type, fs, x, t, r, q, cp) -> iv",
        "amer_implied_vol": "amer_implied_vol(option_type, fs, x, t, r, q, cp) -> iv",
        "euro_implied_vol_76": "euro_implied_vol_76(option_type, fs, x, t, r, cp) -> iv",
        "notes": "cp = observed market price; uses numerical root-finding"
      }
    },

    "parameter_conventions": {
      "option_type": "'c' for call, 'p' for put",
      "fs": "Forward/Spot price of underlying",
      "x": "Strike price",
      "t": "Time to expiration in YEARS (convert days: days/365)",
      "r": "Risk-free rate as decimal (5% = 0.05)",
      "v": "Volatility as decimal (20% = 0.20)",
      "q": "Continuous dividend yield as decimal",
      "t_a": "Time to start of averaging period (Asian options)"
    },

    "return_value_handling": {
      "array_indices": {
        "0": "Option Value/Premium",
        "1": "Delta",
        "2": "Gamma", 
        "3": "Theta (annualized - divide by 365 for daily)",
        "4": "Vega",
        "5": "Rho"
      },
      "example_parsing": "value, delta, gamma, theta, vega, rho = optlib.merton('c', 100, 95, 0.5, 0.05, 0.02, 0.25)"
    },

    "known_limitations": {
      "american_greeks": "Greeks for American options are approximated using GBS model",
      "asian_averaging": "Asian option pricing invalid when currently in averaging period",
      "spread_greeks": "Kirk's approximation does not return Greeks",
      "rate_bounds": "Interest rates should be between -20% and 100%",
      "no_barrier": "Barrier options not implemented - requires custom code"
    }
  },

  "alpaca_integration_details": {
    "sdk": "alpaca-py (official Python SDK)",
    "options_api": {
      "base_url": "https://api.alpaca.markets/v2/options",
      "capabilities": [
        "Option chain retrieval",
        "Option contract details",
        "Real-time quotes (WebSocket)",
        "Historical options data",
        "Options trading (with approval)"
      ],
      "rate_limits": "200 requests/minute for market data"
    },
    "data_mapping": {
      "alpaca_to_optlib": {
        "underlying_price": "fs (spot price)",
        "strike_price": "x",
        "days_to_expiry / 365": "t (years)",
        "implied_volatility": "v (for pricing verification)",
        "market_price": "cp (for IV calculation)"
      }
    },
    "websocket_streaming": {
      "endpoint": "wss://stream.data.alpaca.markets/v1beta1/options",
      "message_types": ["quotes", "trades"],
      "use_case": "Real-time Greeks updates as prices change"
    }
  },

  "timeline_summary": {
    "phase_1": {
      "weeks": "1-3",
      "effort": "Core development",
      "deliverables": ["Pricing API", "Greeks endpoint", "IV solver", "Alpaca integration"]
    },
    "phase_2": {
      "weeks": "4-6", 
      "effort": "Analytics layer",
      "deliverables": ["Vol surface", "Strategy analyzer", "Dashboard components", "P/L visualizations"]
    },
    "phase_3": {
      "weeks": "7-10",
      "effort": "Advanced features",
      "deliverables": ["Exotic options", "Risk management", "Education system", "Paper trading"]
    },
    "total_estimated_time": "10 weeks for full implementation"
  },

  "claude_opus_development_instructions": {
    "approach": "Implement module by module, testing each before proceeding",
    "priority_order": [
      "1. Set up Replit environment with dependencies",
      "2. Create pricing_engine.py with optlib wrapper",
      "3. Build FastAPI application with /price endpoint",
      "4. Add Alpaca client for live market data",
      "5. Create Greeks calculator endpoint",
      "6. Build IV solver endpoint",
      "7. Add strategy analysis endpoints",
      "8. Create React frontend components",
      "9. Build volatility surface visualization",
      "10. Add educational features"
    ],
    "testing_approach": "Use Alpaca paper trading credentials for all testing",
    "code_style": "Type hints, docstrings, Pydantic models for validation"
  }
}
```

---

## Key integration decisions

The architecture separates concerns cleanly: **optlib handles all numerical computation**, Alpaca provides real-time market data, and FastAPI orchestrates the API layer. This allows Claude Opus 4.5 to implement each module independently while maintaining clear interfaces between components.

**optlib's return array convention** (`[value, delta, gamma, theta, vega, rho]`) should be wrapped immediately in the pricing engine to return structured dictionaries or Pydantic models—this prevents index-based bugs and improves code readability throughout the application.

For **American options**, the Bjerksund-Stensland approximation trades some accuracy for computational speed. In practice, the difference from binomial tree methods is typically under **2%** for most strikes and expirations, acceptable for retail trading applications.

---

## Critical technical notes

The **Theta value from optlib is annualized**—divide by 365 for daily theta decay, which is what traders typically expect to see. The **time-to-expiry parameter (t) must be in years**, requiring a conversion from days: `t = days_to_expiry / 365`.

Kirk's approximation for **spread options returns only the price, not Greeks**. If spread option Greeks are required, numerical differentiation (bumping inputs) or alternative implementations will be necessary.

The TDAmeritrade API module in optlib is **deprecated** following the Schwab acquisition—all market data integration should use Alpaca's options API instead, which provides similar functionality with active support.

---

## Recommended first implementation

Begin with a minimal viable pricing endpoint that wraps `optlib.merton()` for European options with dividend yield support. This single endpoint demonstrates the full integration pattern and provides immediate value while establishing the code structure for subsequent features.

```python
# backend/services/pricing_engine.py - Initial implementation
from optlib import merton, american, euro_implied_vol

def price_option(option_type: str, spot: float, strike: float, 
                 days_to_expiry: int, rate: float, volatility: float,
                 dividend_yield: float = 0.0, style: str = "european") -> dict:
    t = days_to_expiry / 365.0
    
    if style == "european":
        result = merton(option_type[0].lower(), spot, strike, t, rate, dividend_yield, volatility)
    else:
        result = american(option_type[0].lower(), spot, strike, t, rate, dividend_yield, volatility)
    
    return {
        "price": result[0],
        "delta": result[1],
        "gamma": result[2],
        "theta_daily": result[3] / 365,
        "vega": result[4],
        "rho": result[5]
    }
```

This foundation supports all Phase 1 objectives and provides the pattern for extending to exotic options and advanced analytics in subsequent phases.