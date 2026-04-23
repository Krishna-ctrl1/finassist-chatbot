from typing import List
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import pandas as pd
import yfinance as yf
import base64
import io
import os
import finnhub
from datetime import datetime, timedelta

def get_finnhub_client():
    api_key = os.environ.get('FINNHUB_API_KEY')
    return finnhub.Client(api_key=api_key) if api_key else None

def get_hybrid_history(symbol: str, period: str) -> pd.DataFrame:
    """Fetch historical data using hybrid Finnhub/yfinance approach"""
    is_indian = symbol.upper().endswith('.NS') or symbol.upper().endswith('.BO')
    finnhub_client = get_finnhub_client()
    
    # Map periods to Finnhub resolutions and timestamps
    # yfinance periods: "1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"
    now_int = int(datetime.now().timestamp())
    days_map = {"1d": 1, "5d": 5, "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825}
    days = days_map.get(period, 365)
    start_int = int((datetime.now() - timedelta(days=days)).timestamp())
    
    resolution = "D"
    if days <= 5:
        resolution = "60"
    
    if finnhub_client and not is_indian:
        try:
            res = finnhub_client.stock_candles(symbol, resolution, start_int, now_int)
            if res and res.get('s') == 'ok':
                df = pd.DataFrame({
                    'Open': res['o'],
                    'High': res['h'],
                    'Low': res['l'],
                    'Close': res['c'],
                    'Volume': res['v']
                }, index=pd.to_datetime(res['t'], unit='s'))
                df.index.name = 'Date'
                if not df.empty:
                    return df
        except Exception as e:
            print(f"Finnhub history failed for {symbol}: {e}")
            
    # Fallback to yfinance
    ticker = yf.Ticker(symbol)
    return ticker.history(period=period)

class ChartService:
    """Service for generating matplotlib stock charts"""
    
    @classmethod
    async def create_stock_chart(cls, symbol: str, period: str = "1y") -> str:
        """Create a price chart for a single stock using matplotlib"""
        try:
            # Fetch stock data using hybrid approach
            hist = get_hybrid_history(symbol, period)
            currency = "₹" if symbol.upper().endswith(".NS") or symbol.upper().endswith(".BO") else "$"
            
            if hist.empty:
                raise ValueError(f"No data available for {symbol}")
            
            # Setup chart style
            cls._setup_chart_style()
            
            # Create figure and axis
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10), height_ratios=[3, 1])
            
            # Price chart
            ax1.plot(hist.index, hist['Close'], linewidth=2, color='#2E86AB', label='Close Price')
            ax1.fill_between(hist.index, hist['Close'], alpha=0.3, color='#2E86AB')
            
            # Add moving averages
            hist['MA20'] = hist['Close'].rolling(window=20).mean()
            hist['MA50'] = hist['Close'].rolling(window=50).mean()
            
            ax1.plot(hist.index, hist['MA20'], linewidth=1, color='#A23B72', label='MA20', alpha=0.8)
            ax1.plot(hist.index, hist['MA50'], linewidth=1, color='#F18F01', label='MA50', alpha=0.8)
            
            # Format price chart
            ax1.set_title(f'{symbol.upper()} Stock Price ({period.upper()})', fontsize=16, fontweight='bold')
            ax1.set_ylabel(f'Price ({currency})', fontsize=12)
            ax1.legend(loc='upper left')
            ax1.grid(True, alpha=0.3)
            
            # Format x-axis dates
            ax1.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
            ax1.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
            
            # Volume chart
            colors = ['#FF6B6B' if close < open else '#4ECDC4' for close, open in zip(hist['Close'], hist['Open'])]
            ax2.bar(hist.index, hist['Volume'], color=colors, alpha=0.7)
            ax2.set_ylabel('Volume', fontsize=12)
            ax2.set_xlabel('Date', fontsize=12)
            ax2.grid(True, alpha=0.3)
            
            # Format volume numbers
            ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{x/1e6:.1f}M' if x >= 1e6 else f'{x/1e3:.0f}K'))
            
            # Format x-axis dates for volume chart
            ax2.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
            ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
            
            plt.tight_layout()
            
            # Convert to base64
            chart_base64 = cls._save_chart_as_base64()
            return chart_base64
            
        except Exception as e:
            raise ValueError(f"Error creating chart for {symbol}: {str(e)}")
    
    @classmethod
    async def create_comparison_chart(cls, symbols: List[str], period: str = "1y") -> str:
        """Create a comparison chart for multiple stocks using matplotlib"""
        try:
            # Setup chart style
            cls._setup_chart_style()
            
            # Create figure
            fig, ax = plt.subplots(figsize=(14, 8))
            
            # Color palette for different stocks
            colors = ['#2E86AB', '#A23B72', '#F18F01', '#C73E1D', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']
            
            stock_data = {}
            
            # Fetch and normalize data for each stock using hybrid approach
            for i, symbol in enumerate(symbols):
                try:
                    hist = get_hybrid_history(symbol, period)
                    currency = "₹" if symbol.upper().endswith(".NS") or symbol.upper().endswith(".BO") else "$"
                    
                    if hist.empty:
                        print(f"Warning: No data for {symbol}")
                        continue
                    
                    # Normalize to percentage change from start
                    normalized_prices = ((hist['Close'] / hist['Close'].iloc[0]) - 1) * 100
                    
                    color = colors[i % len(colors)]
                    display_symbol = symbol.replace('.NS', '').replace('.BO', '')
                    
                    ax.plot(hist.index, normalized_prices, linewidth=2.5, 
                           color=color, label=display_symbol, alpha=0.8)
                    
                    stock_data[symbol] = {
                        'data': hist,
                        'normalized': normalized_prices,
                        'color': color,
                        'display_name': display_symbol
                    }
                    
                except Exception as e:
                    print(f"Warning: Error fetching {symbol}: {str(e)}")
                    continue
            
            if not stock_data:
                raise ValueError("No valid stock data available for comparison")
            
            # Format chart
            ax.set_title(f'Stock Performance Comparison ({period.upper()})', 
                        fontsize=16, fontweight='bold', pad=20)
            ax.set_ylabel('Performance (%)', fontsize=12)
            ax.set_xlabel('Date', fontsize=12)
            ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
            ax.grid(True, alpha=0.3)
            
            # Add zero line
            ax.axhline(y=0, color='black', linestyle='--', alpha=0.5, linewidth=1)
            
            # Format x-axis dates
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
            ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
            
            # Format y-axis as percentage
            ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{x:.1f}%'))
            
            # Add performance summary text
            summary_text = "Performance Summary:\n"
            for symbol, data in stock_data.items():
                final_return = data['normalized'].iloc[-1]
                display_name = data['display_name']
                summary_text += f"{display_name}: {final_return:+.1f}%\n"
            
            ax.text(0.02, 0.98, summary_text, transform=ax.transAxes, 
                   verticalalignment='top', bbox=dict(boxstyle='round', 
                   facecolor='white', alpha=0.8), fontsize=9)
            
            plt.tight_layout()
            
            # Convert to base64
            chart_base64 = cls._save_chart_as_base64()
            return chart_base64
            
        except Exception as e:
            raise ValueError(f"Error creating comparison chart: {str(e)}")
    
    @classmethod
    async def create_mutual_fund_chart(cls, scheme_code: str, period: str = "1y") -> str:
        """Create a NAV chart for a mutual fund using MFAPI (with mftool fallback)"""
        try:
            data = None
            scheme_name = f"Scheme {scheme_code}"

            # Primary: Try MFAPI for historical data
            try:
                import httpx
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(f"https://api.mfapi.in/mf/{scheme_code}")
                    resp.raise_for_status()
                    api_data = resp.json()
                    if api_data.get("status") == "SUCCESS" and api_data.get("data"):
                        scheme_name = api_data.get("meta", {}).get("scheme_name", scheme_name)
                        # Convert MFAPI format to DataFrame
                        df = pd.DataFrame(api_data["data"])
                        df['date'] = pd.to_datetime(df['date'], format='%d-%m-%Y')
                        df['nav'] = pd.to_numeric(df['nav'])
                        df.set_index('date', inplace=True)
                        df.sort_index(inplace=True)
                        data = df
                        print(f"MFAPI: Loaded {len(df)} NAV records for {scheme_code}")
            except Exception as api_err:
                print(f"MFAPI chart data failed for {scheme_code}: {api_err}")

            # Fallback: mftool
            if data is None or data.empty:
                print(f"Falling back to mftool for chart data for {scheme_code}...")
                from mftool import Mftool
                mf = Mftool()
                raw = mf.get_scheme_historical_nav(scheme_code, as_json=False)
                
                if not raw or 'data' not in raw or not raw['data']:
                    raise ValueError(f"No historical data available for scheme {scheme_code}")
                
                scheme_name = raw.get('meta', {}).get('scheme_name', scheme_name)
                df = pd.DataFrame(raw['data'])
                df['date'] = pd.to_datetime(df['date'], format='%d-%m-%Y')
                df['nav'] = pd.to_numeric(df['nav'])
                df.set_index('date', inplace=True)
                df.sort_index(inplace=True)
                data = df

            if data is None or data.empty:
                raise ValueError(f"No data available for scheme {scheme_code}")

            # Filter by period
            days_map = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "3y": 1095, "5y": 1825}
            days = days_map.get(period, 365)
            start_date = datetime.now() - timedelta(days=days)
            data = data[data.index >= start_date]
            
            if data.empty:
                raise ValueError(f"No data available in the requested period {period}")
                
            # Setup chart style
            cls._setup_chart_style()
            
            # Create figure
            fig, ax = plt.subplots(figsize=(12, 6))
            
            # Price chart
            ax.plot(data.index, data['nav'], linewidth=2.5, color='#4ECDC4', label='NAV')
            ax.fill_between(data.index, data['nav'], alpha=0.3, color='#4ECDC4')
            
            # Format chart
            ax.set_title(f'{scheme_name} ({period.upper()})', fontsize=16, fontweight='bold', pad=20)
            ax.set_ylabel('NAV (₹)', fontsize=12)
            ax.legend(loc='upper left')
            ax.grid(True, alpha=0.3)
            
            # Format x-axis dates
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
            ax.xaxis.set_major_locator(mdates.MonthLocator(interval=max(1, days // 150)))
            
            plt.tight_layout()
            
            # Convert to base64
            return cls._save_chart_as_base64()
            
        except Exception as e:
            raise ValueError(f"Error creating chart for mutual fund {scheme_code}: {str(e)}")

    @classmethod
    def _setup_chart_style(cls):
        """Setup consistent chart styling"""
        # Use a more widely available style
        try:
            plt.style.use('seaborn-v0_8')
        except OSError:
            try:
                plt.style.use('seaborn')
            except OSError:
                plt.style.use('default')
        
        plt.rcParams['figure.figsize'] = (12, 8)
        plt.rcParams['font.size'] = 10
        plt.rcParams['axes.labelsize'] = 12
        plt.rcParams['axes.titlesize'] = 14
        plt.rcParams['xtick.labelsize'] = 10
        plt.rcParams['ytick.labelsize'] = 10
        plt.rcParams['legend.fontsize'] = 10
        plt.rcParams['figure.facecolor'] = 'white'
        plt.rcParams['axes.facecolor'] = 'white'
    
    @classmethod
    def _save_chart_as_base64(cls) -> str:
        """Convert matplotlib chart to base64 string"""
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        buffer.seek(0)
        image_png = buffer.getvalue()
        buffer.close()
        
        graphic = base64.b64encode(image_png)
        graphic = graphic.decode('utf-8')
        plt.close()  # Close the figure to free memory
        return graphic
    
    @classmethod
    async def create_candlestick_chart(cls, symbol: str, period: str = "3mo") -> str:
        """Create a candlestick chart for detailed price action analysis"""
        try:
            # Fetch stock data using hybrid approach
            hist = get_hybrid_history(symbol, period)
            currency = "₹" if symbol.upper().endswith(".NS") or symbol.upper().endswith(".BO") else "$"
            
            if hist.empty:
                raise ValueError(f"No data available for {symbol}")
            
            # Setup chart style
            cls._setup_chart_style()
            
            # Create figure
            fig, ax = plt.subplots(figsize=(14, 8))
            
            # Create candlestick-like bars
            for i, (date, row) in enumerate(hist.iterrows()):
                open_price, high_price, low_price, close_price = row['Open'], row['High'], row['Low'], row['Close']
                
                # Determine color
                color = '#4ECDC4' if close_price >= open_price else '#FF6B6B'
                
                # Draw the high-low line
                ax.plot([date, date], [low_price, high_price], color='black', linewidth=1, alpha=0.7)
                
                # Draw the open-close rectangle
                height = abs(close_price - open_price)
                bottom = min(open_price, close_price)
                ax.bar(date, height, bottom=bottom, color=color, alpha=0.8, width=pd.Timedelta(days=0.8))
            
            # Format chart
            ax.set_title(f'{symbol.upper()} Candlestick Chart ({period.upper()})', 
                        fontsize=16, fontweight='bold')
            ax.set_ylabel(f'Price ({currency})', fontsize=12)
            ax.set_xlabel('Date', fontsize=12)
            ax.grid(True, alpha=0.3)
            
            # Format x-axis dates
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
            ax.xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))
            plt.setp(ax.xaxis.get_majorticklabels(), rotation=45)
            
            plt.tight_layout()
            
            # Convert to base64
            chart_base64 = cls._save_chart_as_base64()
            return chart_base64
            
        except Exception as e:
            raise ValueError(f"Error creating candlestick chart for {symbol}: {str(e)}")
    
    @classmethod
    async def create_volume_analysis_chart(cls, symbol: str, period: str = "6mo") -> str:
        """Create a volume analysis chart with price overlay"""
        try:
            # Fetch stock data using hybrid approach
            hist = get_hybrid_history(symbol, period)
            currency = "₹" if symbol.upper().endswith(".NS") or symbol.upper().endswith(".BO") else "$"
            
            if hist.empty:
                raise ValueError(f"No data available for {symbol}")
            
            # Setup chart style
            cls._setup_chart_style()
            
            # Create figure with subplots
            fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(14, 12), height_ratios=[2, 1, 1])
            
            # Price chart with volume-weighted average price (VWAP)
            ax1.plot(hist.index, hist['Close'], linewidth=2, color='#2E86AB', label='Close Price')
            
            # Calculate VWAP
            hist['VWAP'] = (hist['Volume'] * (hist['High'] + hist['Low'] + hist['Close']) / 3).cumsum() / hist['Volume'].cumsum()
            ax1.plot(hist.index, hist['VWAP'], linewidth=2, color='#A23B72', label='VWAP', alpha=0.8)
            
            ax1.set_title(f'{symbol.upper()} Volume Analysis ({period.upper()})', fontsize=16, fontweight='bold')
            ax1.set_ylabel(f'Price ({currency})', fontsize=12)
            ax1.legend()
            ax1.grid(True, alpha=0.3)
            
            # Volume chart with moving average
            ax2.bar(hist.index, hist['Volume'], alpha=0.6, color='#4ECDC4')
            hist['Volume_MA'] = hist['Volume'].rolling(window=20).mean()
            ax2.plot(hist.index, hist['Volume_MA'], color='#FF6B6B', linewidth=2, label='Volume MA20')
            
            ax2.set_ylabel('Volume', fontsize=12)
            ax2.legend()
            ax2.grid(True, alpha=0.3)
            ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{x/1e6:.1f}M' if x >= 1e6 else f'{x/1e3:.0f}K'))
            
            # Volume-Price Trend (VPT)
            hist['VPT'] = (hist['Volume'] * ((hist['Close'] - hist['Close'].shift(1)) / hist['Close'].shift(1))).cumsum()
            ax3.plot(hist.index, hist['VPT'], linewidth=2, color='#F18F01', label='Volume-Price Trend')
            ax3.axhline(y=0, color='black', linestyle='--', alpha=0.5)
            
            ax3.set_ylabel('VPT', fontsize=12)
            ax3.set_xlabel('Date', fontsize=12)
            ax3.legend()
            ax3.grid(True, alpha=0.3)
            
            # Format x-axis for all subplots
            for ax in [ax1, ax2, ax3]:
                ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
                ax.xaxis.set_major_locator(mdates.MonthLocator(interval=1))
            
            plt.tight_layout()
            
            # Convert to base64
            chart_base64 = cls._save_chart_as_base64()
            return chart_base64
            
        except Exception as e:
            raise ValueError(f"Error creating volume analysis chart for {symbol}: {str(e)}")
