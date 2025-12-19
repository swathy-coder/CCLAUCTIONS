import { useEffect, useState } from 'react';
import { loadAuctionStateOnline, loadAuctionState } from '../src/firebase';

interface AuctionInfo {
  id: string;
  round: number;
  playersSold: number;
  timestamp: number;
  status: 'In Progress' | 'Paused';
}

interface RecoveryModalProps {
  onResume: (auctionData: unknown) => void;
  onCancel: () => void;
}

export default function RecoveryModal({ onResume, onCancel }: RecoveryModalProps) {
  const [auctions, setAuctions] = useState<AuctionInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Load recent auctions from localStorage
    const recentAuctions: AuctionInfo[] = [];
    const keys = Object.keys(localStorage);
    
    for (const key of keys) {
      if (key.startsWith('auction_')) {
        try {
          const auctionId = key.replace('auction_', '');
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          
          if (data && data.auctionLog) {
            const soldCount = data.auctionLog.filter((l: any) => l.status === 'Sold').length;
            recentAuctions.push({
              id: auctionId,
              round: data.round || 1,
              playersSold: soldCount,
              timestamp: data.timestamp || 0,
              status: 'In Progress'
            });
          }
        } catch (e) {
          console.error('Error parsing auction data:', e);
        }
      }
    }
    
    // Sort by timestamp (newest first)
    recentAuctions.sort((a, b) => b.timestamp - a.timestamp);
    setAuctions(recentAuctions.slice(0, 10));
    
    // Auto-select first auction if only one exists
    if (recentAuctions.length === 1) {
      setSelectedId(recentAuctions[0].id);
    }
  }, []);

  const handleResume = async () => {
    if (!selectedId) {
      setError('Please select an auction to resume');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Try to load from Firebase first
      console.log('📡 Fetching auction from Firebase:', selectedId);
      const firebaseData = await loadAuctionStateOnline(selectedId);
      
      if (firebaseData) {
        console.log('✅ Loaded from Firebase:', firebaseData);
        onResume(firebaseData);
        return;
      }

      // Fallback to localStorage
      console.log('⚠️ Firebase unavailable, loading from localStorage');
      const localData = loadAuctionState(selectedId);
      if (localData) {
        console.log('✅ Loaded from localStorage:', localData);
        onResume(localData);
        return;
      }

      setError('Failed to load auction data. Please try again.');
    } catch (err) {
      console.error('Resume error:', err);
      // Try localStorage fallback
      const localData = loadAuctionState(selectedId);
      if (localData) {
        console.log('✅ Fallback to localStorage succeeded');
        onResume(localData);
      } else {
        setError('Unable to resume auction. No data found.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          borderRadius: '1.5rem',
          padding: '2rem',
          maxWidth: '500px',
          width: '90%',
          border: '2px solid rgba(25, 118, 210, 0.3)',
          boxShadow: '0 8px 32px rgba(25, 118, 210, 0.2)',
        }}
      >
        <h2
          style={{
            fontSize: '1.8rem',
            fontWeight: 700,
            color: '#fff',
            margin: '0 0 1rem 0',
            textAlign: 'center',
          }}
        >
          🏏 Resume Auction
        </h2>

        <p
          style={{
            color: '#aaa',
            textAlign: 'center',
            marginBottom: '1.5rem',
            fontSize: '0.95rem',
          }}
        >
          Select an auction to resume from where you left off
        </p>

        {auctions.length > 0 ? (
          <div
            style={{
              maxHeight: '300px',
              overflowY: 'auto',
              marginBottom: '1.5rem',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '0.8rem',
              padding: '0.5rem',
            }}
          >
            {auctions.map((auction) => (
              <div
                key={auction.id}
                onClick={() => setSelectedId(auction.id)}
                style={{
                  padding: '1rem',
                  marginBottom: '0.5rem',
                  background:
                    selectedId === auction.id
                      ? 'rgba(25, 118, 210, 0.3)'
                      : 'rgba(255, 255, 255, 0.05)',
                  border:
                    selectedId === auction.id
                      ? '2px solid rgba(25, 118, 210, 0.6)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '0.6rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: '#1e88e5',
                    }}
                  >
                    {auction.id}
                  </span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      background: 'rgba(76, 175, 80, 0.2)',
                      color: '#4caf50',
                      padding: '0.3rem 0.8rem',
                      borderRadius: '0.4rem',
                    }}
                  >
                    {auction.status}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#999',
                    display: 'flex',
                    gap: '1.5rem',
                  }}
                >
                  <span>📍 Round {auction.round}</span>
                  <span>👤 Sold: {auction.playersSold}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '2rem',
              color: '#666',
            }}
          >
            <p>No recent auctions found. Start a new auction.</p>
          </div>
        )}

        {error && (
          <div
            style={{
              background: 'rgba(211, 47, 47, 0.2)',
              border: '1px solid rgba(211, 47, 47, 0.5)',
              color: '#ff5252',
              padding: '0.8rem',
              borderRadius: '0.6rem',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              textAlign: 'center',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '0.8rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.6rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              opacity: loading ? 0.5 : 1,
            }}
          >
            New Auction
          </button>
          <button
            onClick={handleResume}
            disabled={!selectedId || loading}
            style={{
              padding: '0.8rem 1.5rem',
              background:
                selectedId && !loading
                  ? 'linear-gradient(135deg, #1976d2, #1565c0)'
                  : 'rgba(25, 118, 210, 0.3)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.6rem',
              cursor: selectedId && !loading ? 'pointer' : 'not-allowed',
              fontSize: '1rem',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              opacity: selectedId && !loading ? 1 : 0.5,
            }}
          >
            {loading ? '⏳ Loading...' : '▶️ Resume'}
          </button>
        </div>
      </div>
    </div>
  );
}
