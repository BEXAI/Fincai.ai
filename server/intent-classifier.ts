/**
 * Intent Classification Layer for Fincai AI Trading Assistant
 * 
 * This module classifies user messages into specific intents BEFORE attempting
 * any stock symbol lookups. This prevents common words like "Hello" from being
 * incorrectly interpreted as stock tickers.
 * 
 * Architecture:
 * User Message → Intent Classifier → Route Handler → Claude AI → Response
 */

export type IntentType = 
  | 'greeting'
  | 'farewell'
  | 'help'
  | 'thanks'
  | 'affirmation'
  | 'negation'
  | 'stock_query'
  | 'trading_command'
  | 'alert_command'
  | 'analysis_request'
  | 'market_query'
  | 'portfolio_query'
  | 'options_query'
  | 'educational'
  | 'conversation'
  | 'unknown';

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  extractedSymbol?: string;
  extractedAction?: string;
  extractedQuantity?: number;
  extractedPrice?: number;
  rawMessage: string;
  normalizedMessage: string;
  shouldSkipSymbolLookup: boolean;
  suggestedResponse?: string;
}

const SYMBOL_BLACKLIST = new Set([
  'hello', 'hi', 'hey', 'howdy', 'greetings', 'yo', 'sup', 'hola', 'hiya',
  'bye', 'goodbye', 'later', 'cya', 'see', 'take', 'care',
  'help', 'thanks', 'thank', 'please', 'sorry', 'okay', 'ok', 'yes', 'no', 
  'yeah', 'yep', 'nope', 'nah', 'sure', 'fine', 'good', 'great', 'awesome',
  'cool', 'nice', 'wow', 'omg', 'lol', 'haha', 'hmm', 'umm', 'uhh',
  'what', 'how', 'why', 'when', 'where', 'who', 'which', 'whom', 'whose',
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must',
  'do', 'does', 'did', 'done', 'doing', 'be', 'been', 'being', 'am', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'having', 'get', 'got', 'getting', 'give', 'gave', 'giving',
  'show', 'tell', 'explain', 'describe', 'analyze', 'check', 'look', 'find', 'search',
  'buy', 'sell', 'hold', 'trade', 'invest', 'portfolio', 'stock', 'stocks', 'share', 'shares',
  'price', 'quote', 'chart', 'graph', 'trend', 'market', 'markets',
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'at', 'by', 'for', 
  'from', 'in', 'into', 'of', 'on', 'to', 'up', 'with', 'about', 'after', 'before',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them', 'their', 'theirs',
  'this', 'that', 'these', 'those', 'here', 'there', 'now', 'then', 'today', 'tomorrow', 'yesterday',
  'want', 'need', 'like', 'love', 'hate', 'think', 'know', 'feel', 'see', 'hear',
  'make', 'take', 'put', 'set', 'go', 'come', 'back', 'out', 'over', 'under',
  'more', 'less', 'most', 'least', 'some', 'any', 'all', 'each', 'every', 'both', 'few', 'many', 'much',
  'first', 'last', 'next', 'new', 'old', 'high', 'low', 'big', 'small', 'long', 'short',
  'just', 'only', 'even', 'still', 'also', 'very', 'really', 'quite', 'too', 'enough',
  'well', 'right', 'wrong', 'true', 'false', 'real', 'fake',
  'money', 'cash', 'dollar', 'dollars', 'cent', 'cents', 'profit', 'loss', 'gain', 'gains',
  'option', 'options', 'call', 'calls', 'put', 'puts', 'strike', 'expiry', 'expiration',
  'risk', 'reward', 'return', 'returns', 'yield', 'dividend', 'dividends',
  'bull', 'bear', 'bullish', 'bearish', 'long', 'short', 'position', 'positions',
  'alert', 'alerts', 'notify', 'notification', 'watch', 'watchlist',
  'morning', 'afternoon', 'evening', 'night', 'day', 'week', 'month', 'year',
  'always', 'never', 'sometimes', 'maybe', 'perhaps', 'probably', 'definitely',
  'test', 'testing', 'demo', 'example', 'sample',
]);

const GREETING_PATTERNS = [
  /^(hi|hello|hey|howdy|greetings|yo|sup|hola|hiya|good\s*(morning|afternoon|evening|day))[\s!?.]*$/i,
  /^(hi|hello|hey)\s+there[\s!?.]*$/i,
  /^what'?s?\s+up[\s!?.]*$/i,
  /^how('s|\s+is|\s+are)\s+(it\s+going|you|things|everything)[\s!?.]*$/i,
  /^(nice|good)\s+to\s+(meet|see)\s+you[\s!?.]*$/i,
];

const FAREWELL_PATTERNS = [
  /^(bye|goodbye|later|cya|see\s+ya|take\s+care|peace|out|gotta\s+go)[\s!?.]*$/i,
  /^(have\s+a\s+)?(good|great|nice)\s+(day|night|one|evening|weekend)[\s!?.]*$/i,
  /^talk\s+(to\s+you\s+)?later[\s!?.]*$/i,
  /^(thanks?\s+)?(bye|goodbye)[\s!?.]*$/i,
];

const HELP_PATTERNS = [
  /^help[\s!?.]*$/i,
  /^(i\s+)?need\s+help[\s!?.]*$/i,
  /^(can|could)\s+you\s+help(\s+me)?[\s!?.]*$/i,
  /^what\s+can\s+you\s+do[\s!?.]*$/i,
  /^how\s+does\s+this\s+work[\s!?.]*$/i,
  /^(show|tell)\s+me\s+(what|how)\s+(you\s+can\s+do|to\s+use\s+(this|you))[\s!?.]*$/i,
  /^(get\s+)?start(ed|ing)?[\s!?.]*$/i,
  /^instructions?[\s!?.]*$/i,
  /^guide[\s!?.]*$/i,
  /^tutorial[\s!?.]*$/i,
];

const THANKS_PATTERNS = [
  /^(thanks?|thank\s+you|thx|ty|appreciate\s+it|much\s+appreciated)[\s!?.]*$/i,
  /^(thanks?\s+)?(a\s+lot|so\s+much|very\s+much)[\s!?.]*$/i,
  /^(that'?s?\s+)?(great|awesome|perfect|helpful|exactly\s+what\s+i\s+needed)[\s!?.]*$/i,
];

const AFFIRMATION_PATTERNS = [
  /^(yes|yeah|yep|yup|sure|ok|okay|alright|definitely|absolutely|correct|right|exactly)[\s!?.]*$/i,
  /^(sounds?\s+)?good[\s!?.]*$/i,
  /^(do\s+)?it[\s!?.]*$/i,
  /^go\s+(ahead|for\s+it)[\s!?.]*$/i,
  /^(please\s+)?proceed[\s!?.]*$/i,
  /^confirm(ed)?[\s!?.]*$/i,
];

const NEGATION_PATTERNS = [
  /^(no|nope|nah|not\s+really|never\s*mind|cancel|stop|don'?t|wait)[\s!?.]*$/i,
  /^(i\s+)?changed?\s+my\s+mind[\s!?.]*$/i,
  /^(forget|skip)\s+(it|that)[\s!?.]*$/i,
  /^(not\s+)?(right\s+)?now[\s!?.]*$/i,
];

const MARKET_QUERY_PATTERNS = [
  /\b(market|markets)\s*(overview|summary|today|now|status|update)?\b/i,
  /\b(top|biggest?|today'?s?)\s*(gainers?|losers?|movers?|winners?|decliners?)\b/i,
  /\bwhat'?s?\s+(moving|trending|hot|popular)\b/i,
  /\b(most\s+)?active\s*(stocks?|tickers?)?\b/i,
  /\bmarket\s+movers?\b/i,
  /\bhow('s|\s+is)\s+the\s+market\b/i,
];

const PORTFOLIO_QUERY_PATTERNS = [
  /\b(my\s+)?(portfolio|holdings?|positions?|balance|account)\b/i,
  /\bwhat\s+do\s+i\s+(own|have|hold)\b/i,
  /\b(show|check|view)\s+(my\s+)?(portfolio|holdings?|positions?)\b/i,
  /\bhow\s+(am\s+i|is\s+my\s+portfolio)\s+(doing|performing)\b/i,
  /\b(my\s+)?p(&|and)?l\b/i,
  /\b(total\s+)?(value|worth)\s+(of\s+)?(my\s+)?(portfolio|account)\b/i,
];

const OPTIONS_QUERY_PATTERNS = [
  /\boption(s)?\s+(chain|pricing|strategy|strategies|calculator)\b/i,
  /\b(implied\s+)?volatility\b/i,
  /\bgreeks?\b/i,
  /\b(call|put)\s+(options?|spreads?|premium)\b/i,
  /\b(iron\s+)?(condor|butterfly|spread|straddle|strangle)\b/i,
  /\bstrike\s+price\b/i,
  /\bexpir(y|ation)\s*(date)?\b/i,
  /\bexercise\b/i,
  /\b(covered\s+call|cash\s+secured\s+put|protective\s+put)\b/i,
];

const EDUCATIONAL_PATTERNS = [
  /\b(what\s+is|what'?s?|explain|define|tell\s+me\s+about|teach\s+me|learn\s+about)\s+(a\s+)?(stock|option|call|put|spread|etf|index|dividend|p\/e|market\s+cap|volatility|greeks?|delta|gamma|theta|vega|rho)\b/i,
  /\bhow\s+(do|does|to)\s+(stocks?|options?|trading|investing|the\s+market)\s+work\b/i,
  /\b(beginner|basics?|fundamental|introduction|intro)\b/i,
  /\bdifference\s+between\b/i,
  /\bwhat\s+does\s+\w+\s+mean\b/i,
];

const STOCK_QUERY_INDICATORS = [
  /\bprice\s+(of|for)\s+/i,
  /\bquote\s+(for|on)\s+/i,
  /\bhow('s|\s+is)\s+\w{1,5}\s+(doing|trading|performing)/i,
  /\bwhat'?s?\s+\w{1,5}\s+(at|trading\s+at|price)/i,
  /\bcheck\s+\w{1,5}/i,
  /\$[A-Z]{1,5}\b/,
  /\b[A-Z]{1,5}\s+stock\b/i,
];

const TRADING_COMMAND_PATTERNS = [
  /\b(buy|purchase|acquire|long)\s+(\d+\s+)?(shares?\s+)?(of\s+)?([A-Z]{1,5})\b/i,
  /\b(sell|dump|exit|close|short)\s+(\d+\s+)?(shares?\s+)?(of\s+)?([A-Z]{1,5})\b/i,
  /\b(add|remove)\s+([A-Z]{1,5})\s+(to|from)\s+(my\s+)?(portfolio|watchlist)\b/i,
];

const ALERT_COMMAND_PATTERNS = [
  /\b(alert|notify|tell|remind|ping|watch)\s+(me\s+)?(when|if|for)\s+([A-Z]{1,5})\b/i,
  /\b(set|create|add)\s+(a\s+)?(\w+\s+)?alert\s+(for\s+)?([A-Z]{1,5})\b/i,
  /\b([A-Z]{1,5})\s+(at|above|below|when)\s+\$?[\d.,]+\b/i,
];

const ANALYSIS_REQUEST_PATTERNS = [
  /\b(analyze|analysis|analyse|breakdown|deep\s+dive|research)\s+(of\s+)?([A-Z]{1,5})\b/i,
  /\btechnical\s+(analysis|indicators?)\s+(for|of|on)\s+([A-Z]{1,5})\b/i,
  /\b(bull|bear)\s+(case|thesis)\s+(for|on)\s+([A-Z]{1,5})\b/i,
  /\b(should\s+i|is\s+it\s+(a\s+)?good\s+(time\s+)?(to\s+)?)(buy|sell|invest\s+in)\s+([A-Z]{1,5})\b/i,
  /\bwhat\s+do\s+you\s+think\s+(of|about)\s+([A-Z]{1,5})\b/i,
];

function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .trim()
    .replace(/[^\w\s$%'.,-]/g, '')
    .replace(/\s+/g, ' ');
}

function matchPatterns(message: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(message));
}

function extractPotentialSymbol(message: string): string | undefined {
  const symbolPatterns = [
    /\$([A-Z]{1,5})\b/i,
    /\b([A-Z]{1,5})\s+stock\b/i,
    /\bprice\s+(?:of|for)\s+([A-Z]{1,5})\b/i,
    /\bquote\s+(?:for|on)\s+([A-Z]{1,5})\b/i,
    /\b(?:buy|sell|analyze|check)\s+(?:\d+\s+)?(?:shares?\s+)?(?:of\s+)?([A-Z]{1,5})\b/i,
    /\bhow(?:'s|\s+is)\s+([A-Z]{1,5})\s+(?:doing|trading|performing)/i,
    /\bwhat(?:'s)?\s+([A-Z]{1,5})\s+(?:at|trading)/i,
  ];

  for (const pattern of symbolPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const symbol = match[1].toUpperCase();
      if (!SYMBOL_BLACKLIST.has(symbol.toLowerCase()) && symbol.length >= 1 && symbol.length <= 5) {
        return symbol;
      }
    }
  }

  const bareSymbolMatch = message.match(/^([A-Z]{1,5})$/i);
  if (bareSymbolMatch) {
    const symbol = bareSymbolMatch[1].toUpperCase();
    if (!SYMBOL_BLACKLIST.has(symbol.toLowerCase())) {
      return symbol;
    }
  }

  return undefined;
}

function getGreetingResponse(): string {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  
  const responses = [
    `${timeGreeting}! I'm your AI trading assistant. How can I help you today? You can ask me about stock prices, market trends, or your portfolio.`,
    `${timeGreeting}! Ready to help with your trading needs. What would you like to know? Try asking "What's SPY at?" or "Show me today's top gainers."`,
    `Hey there! I'm here to help you navigate the markets. Ask me about any stock, check your portfolio, or get market insights.`,
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

function getHelpResponse(): string {
  return `I'm your AI trading assistant! Here's what I can help you with:

**Stock Quotes**
- "What's AAPL at?" or just type a ticker like "SPY"
- "How is TSLA doing today?"

**Market Overview**
- "Show me today's top gainers"
- "What's trending in the market?"
- "Most active stocks"

**Portfolio**
- "Show my portfolio"
- "How are my positions doing?"

**Analysis**
- "Analyze NVDA"
- "What do you think about MSFT?"

**Alerts**
- "Alert me when AAPL hits $200"
- "Watch SPY at $600"

**Options**
- "AAPL options chain"
- "Calculate Greeks for SPY call"

Just ask naturally - I understand conversational language!`;
}

function getThanksResponse(): string {
  const responses = [
    "You're welcome! Let me know if you need anything else.",
    "Happy to help! Feel free to ask me anything about the markets.",
    "Anytime! I'm here if you have more questions.",
    "Glad I could help! What else can I do for you?",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function getFarewellResponse(): string {
  const responses = [
    "Take care! Good luck with your trades.",
    "Goodbye! May your portfolio be forever green.",
    "See you later! Happy trading!",
    "Bye! Come back anytime you need market insights.",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

export function classifyIntent(message: string): IntentClassification {
  const normalizedMessage = normalizeMessage(message);
  const trimmedMessage = message.trim();
  
  const result: IntentClassification = {
    intent: 'unknown',
    confidence: 0,
    rawMessage: message,
    normalizedMessage,
    shouldSkipSymbolLookup: false,
  };

  if (matchPatterns(trimmedMessage, GREETING_PATTERNS)) {
    result.intent = 'greeting';
    result.confidence = 0.95;
    result.shouldSkipSymbolLookup = true;
    result.suggestedResponse = getGreetingResponse();
    return result;
  }

  if (matchPatterns(trimmedMessage, FAREWELL_PATTERNS)) {
    result.intent = 'farewell';
    result.confidence = 0.95;
    result.shouldSkipSymbolLookup = true;
    result.suggestedResponse = getFarewellResponse();
    return result;
  }

  if (matchPatterns(trimmedMessage, HELP_PATTERNS)) {
    result.intent = 'help';
    result.confidence = 0.95;
    result.shouldSkipSymbolLookup = true;
    result.suggestedResponse = getHelpResponse();
    return result;
  }

  if (matchPatterns(trimmedMessage, THANKS_PATTERNS)) {
    result.intent = 'thanks';
    result.confidence = 0.9;
    result.shouldSkipSymbolLookup = true;
    result.suggestedResponse = getThanksResponse();
    return result;
  }

  if (matchPatterns(trimmedMessage, AFFIRMATION_PATTERNS)) {
    result.intent = 'affirmation';
    result.confidence = 0.85;
    result.shouldSkipSymbolLookup = true;
    return result;
  }

  if (matchPatterns(trimmedMessage, NEGATION_PATTERNS)) {
    result.intent = 'negation';
    result.confidence = 0.85;
    result.shouldSkipSymbolLookup = true;
    return result;
  }

  if (matchPatterns(normalizedMessage, MARKET_QUERY_PATTERNS)) {
    result.intent = 'market_query';
    result.confidence = 0.85;
    result.shouldSkipSymbolLookup = false;
    return result;
  }

  if (matchPatterns(normalizedMessage, PORTFOLIO_QUERY_PATTERNS)) {
    result.intent = 'portfolio_query';
    result.confidence = 0.85;
    result.shouldSkipSymbolLookup = true;
    return result;
  }

  if (matchPatterns(normalizedMessage, OPTIONS_QUERY_PATTERNS)) {
    result.intent = 'options_query';
    result.confidence = 0.8;
    result.extractedSymbol = extractPotentialSymbol(message);
    result.shouldSkipSymbolLookup = !result.extractedSymbol;
    return result;
  }

  if (matchPatterns(normalizedMessage, EDUCATIONAL_PATTERNS)) {
    result.intent = 'educational';
    result.confidence = 0.85;
    result.shouldSkipSymbolLookup = true;
    return result;
  }

  if (matchPatterns(message, TRADING_COMMAND_PATTERNS)) {
    result.intent = 'trading_command';
    result.confidence = 0.9;
    result.extractedSymbol = extractPotentialSymbol(message);
    result.shouldSkipSymbolLookup = false;
    return result;
  }

  if (matchPatterns(message, ALERT_COMMAND_PATTERNS)) {
    result.intent = 'alert_command';
    result.confidence = 0.9;
    result.extractedSymbol = extractPotentialSymbol(message);
    result.shouldSkipSymbolLookup = false;
    return result;
  }

  if (matchPatterns(message, ANALYSIS_REQUEST_PATTERNS)) {
    result.intent = 'analysis_request';
    result.confidence = 0.85;
    result.extractedSymbol = extractPotentialSymbol(message);
    result.shouldSkipSymbolLookup = false;
    return result;
  }

  if (matchPatterns(message, STOCK_QUERY_INDICATORS)) {
    result.intent = 'stock_query';
    result.confidence = 0.8;
    result.extractedSymbol = extractPotentialSymbol(message);
    result.shouldSkipSymbolLookup = false;
    return result;
  }

  const potentialSymbol = extractPotentialSymbol(message);
  if (potentialSymbol) {
    result.intent = 'stock_query';
    result.confidence = 0.7;
    result.extractedSymbol = potentialSymbol;
    result.shouldSkipSymbolLookup = false;
    return result;
  }

  const words = normalizedMessage.split(/\s+/);
  if (words.length === 1 && SYMBOL_BLACKLIST.has(words[0])) {
    result.intent = 'conversation';
    result.confidence = 0.9;
    result.shouldSkipSymbolLookup = true;
    return result;
  }

  result.intent = 'conversation';
  result.confidence = 0.5;
  result.shouldSkipSymbolLookup = true;
  
  return result;
}

export function isBlacklistedWord(word: string): boolean {
  return SYMBOL_BLACKLIST.has(word.toLowerCase());
}

export function shouldTreatAsConversation(classification: IntentClassification): boolean {
  const conversationalIntents: IntentType[] = [
    'greeting', 'farewell', 'help', 'thanks', 'affirmation', 
    'negation', 'educational', 'conversation'
  ];
  return conversationalIntents.includes(classification.intent);
}

export function getBlacklistedWords(): string[] {
  return Array.from(SYMBOL_BLACKLIST);
}
