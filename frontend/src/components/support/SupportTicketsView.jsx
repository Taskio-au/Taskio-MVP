import React, { memo } from 'react';
import { Inbox, MessageSquareText, Paperclip, ReceiptText } from 'lucide-react';

function SupportTicketsView({
  styles,
  myTickets,
  loadError,
  onRetryLoad,
  selectedTicket,
  onSelectTicket,
  onOpenNewTicket,
  formatDate,
  statusLabels,
  statusColors,
}) {
  if (loadError) {
    return (
      <div style={styles.ticketsContainer}>
        <div style={styles.ticketsLoadFailure} className="support-tickets-load-failure" role="alert">
          <div style={styles.ticketsLoadFailureTitle}>We couldn’t load your tickets</div>
          <p style={styles.ticketsLoadFailureText}>{loadError}</p>
          <div style={styles.ticketsLoadFailureActions} className="support-tickets-load-failure-actions">
            <button type="button" style={styles.buttonRetryTickets} onClick={onRetryLoad}>
              Try again
            </button>
            <button type="button" style={styles.buttonSecondary} onClick={onOpenNewTicket}>
              Submit a new ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.ticketsContainer}>
      {myTickets.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Inbox size={42} strokeWidth={1.8} color="#14C5C5" />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#222' }}>No tickets yet</div>
          <div style={{ fontSize: 14, color: '#666' }}>When you submit a support ticket, it will appear here.</div>
          <button type="button" style={{ ...styles.buttonPrimary, marginTop: 16 }} onClick={onOpenNewTicket}>
            Create your first ticket
          </button>
        </div>
      ) : (
        <div style={styles.ticketsGrid} className="support-tickets-grid">
          <div style={styles.ticketsList}>
            {myTickets.map((ticket) => {
              const isSelected = selectedTicket?.id === ticket.id;
              const statusLabel = statusLabels[ticket.status] || ticket.status;
              const preview = String(ticket.message || '').trim().slice(0, 120);
              const ariaLabel = [
                `Support ticket, ${statusLabel}, ${ticket.category || 'general'}`,
                preview ? `: ${preview}` : null,
                isSelected ? ', currently selected' : null,
              ]
                .filter(Boolean)
                .join('');
              return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTicket(ticket);
                  }
                }}
                style={{
                  ...styles.ticketCard,
                  backgroundColor: isSelected ? '#F7F9FA' : '#fff',
                }}
                role="button"
                aria-label={ariaLabel}
                tabIndex={0}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: statusColors[ticket.status] || '#888',
                      backgroundColor: `${statusColors[ticket.status] || '#888'}15`,
                      padding: '3px 8px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                    }}
                  >
                    {statusLabels[ticket.status] || ticket.status}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
                    {ticket.category}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: '#666',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {ticket.message}
                </div>

                <div style={{ fontSize: 11, color: '#999' }}>{formatDate(ticket.createdAt)}</div>

                {ticket.replies && ticket.replies.length > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#14C5C5', marginTop: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <MessageSquareText size={13} strokeWidth={2.2} />
                      {ticket.replies.length} admin {ticket.replies.length === 1 ? 'reply' : 'replies'}
                    </span>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {selectedTicket && (
            <div style={styles.ticketDetail}>
              <div style={styles.ticketDetailHeader}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, fontFamily: 'Poppins, sans-serif' }}>
                    Ticket #{selectedTicket.id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>Submitted {formatDate(selectedTicket.createdAt)}</div>
                </div>

                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: statusColors[selectedTicket.status] || '#888',
                    backgroundColor: `${statusColors[selectedTicket.status] || '#888'}15`,
                    padding: '6px 12px',
                    borderRadius: 6,
                    textTransform: 'uppercase',
                  }}
                >
                  {statusLabels[selectedTicket.status] || selectedTicket.status}
                </span>
              </div>

              <div style={styles.ticketDetailBody}>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase' }}>
                    Your Message
                  </div>
                  <div
                    style={{
                      backgroundColor: '#F7F9FA',
                      padding: 16,
                      borderRadius: 10,
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: '#222',
                    }}
                  >
                    {selectedTicket.message}
                  </div>

                  {selectedTicket.jobId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', marginTop: 8 }}>
                      <ReceiptText size={13} strokeWidth={2.1} />
                      Job ID: {selectedTicket.jobId}
                    </div>
                  )}
                  {selectedTicket.attachment && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', marginTop: 4 }}>
                      <Paperclip size={13} strokeWidth={2.1} />
                      Attachment: {selectedTicket.attachment.fileName}
                    </div>
                  )}
                </div>

                {selectedTicket.replies && selectedTicket.replies.length > 0 ? (
                  <div>
                    {selectedTicket.replies.map((reply, idx) => (
                      <div key={idx} style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#14C5C5', marginBottom: 8, textTransform: 'uppercase' }}>
                          Taskio Support Response
                        </div>
                        <div
                          style={{
                            backgroundColor: '#E6F7F7',
                            padding: 16,
                            borderRadius: 10,
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: '#222',
                          }}
                        >
                          {reply.text}
                        </div>
                        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>{formatDate(reply.timestamp)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: '#999', fontSize: 14 }}>
                    No admin responses yet. We typically reply within 1 business day.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(SupportTicketsView);
