import React, { memo } from 'react';
import { CLIENT_MESSAGE_TEMPLATES } from '../../../constants/clientMessageTemplates';

function ClientDetailsDrawer({
  open,
  styles,
  closeDrawer,
  drawerClient,
  drawerUid,
  clientFull,
  countsByClientUid,
  formatAgeShort,
  clientNoteRef,
  clientNoteDraft,
  onClientNoteDraftChange,
  clientNoteUpdatedAtMs,
  clientNoteSaving,
  onSaveClientNote,
  onGoClientTasks,
  clientLastOutreachAtMs,
  clientCopied,
  onCopyClientTemplate,
  sendVia,
  onOpenDisableClient,
}) {
  if (!open) return null;

  return (
    <div style={styles.drawerOverlay} onMouseDown={closeDrawer}>
      <div style={styles.drawerPanel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.drawerHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.drawerTitle}>Client details</div>
            <div style={styles.drawerSubtitle}>
              {drawerClient?.displayName || drawerClient?.emailMasked || drawerClient?.uid || drawerUid}
            </div>
          </div>
          <button type="button" onClick={closeDrawer} style={styles.drawerCloseBtn} aria-label="Close">×</button>
        </div>

        {!drawerClient ? (
          <div style={{ padding: 14, fontSize: 13, color: '#6B7280' }}>Details unavailable.</div>
        ) : (
          <div style={{ padding: 14, overflowY: 'auto' }}>
            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Client overview</div>
              <div style={styles.drawerGrid}>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Name</span>
                  <span style={styles.drawerVal}>{drawerClient.displayName || '—'}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Email</span>
                  <span style={styles.drawerVal}>
                    {clientFull.loading ? 'Loading…' : (clientFull.data?.email || drawerClient.emailMasked || '—')}
                  </span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Account status</span>
                  <span style={styles.drawerVal}>{drawerClient.status === 'active' ? 'Active' : 'Disabled'}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Signup date</span>
                  <span style={styles.drawerVal}>
                    {drawerClient.createdAt ? new Date(drawerClient.createdAt).toLocaleDateString('en-AU') : '—'}
                  </span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Last active</span>
                  <span style={styles.drawerVal}>{formatAgeShort(drawerClient.updatedAtMs)} <span style={styles.betaTiny}>beta</span></span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Tasks posted</span>
                  <span style={styles.drawerVal}>{countsByClientUid[drawerClient.uid]?.posted || 0}</span>
                </div>
                <div style={styles.drawerItem}>
                  <span style={styles.drawerKey}>Tasks completed</span>
                  <span style={styles.drawerVal}>{countsByClientUid[drawerClient.uid]?.completed || 0}</span>
                </div>
              </div>
              {!!clientFull.error && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#9f1239' }}>
                  {clientFull.error}
                </div>
              )}
            </div>

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Admin notes (internal only)</div>
              <textarea
                ref={clientNoteRef}
                value={clientNoteDraft}
                onChange={(e) => onClientNoteDraftChange(e.target.value)}
                rows={4}
                placeholder="Internal admin note…"
                style={styles.drawerTextarea}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
                Last updated: <span style={{ fontWeight: 900 }}>{clientNoteUpdatedAtMs ? formatAgeShort(clientNoteUpdatedAtMs) : '—'}</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" style={styles.buttonSecondary} onClick={onSaveClientNote} disabled={clientNoteSaving}>
                  {clientNoteSaving ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </div>

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>View tasks</div>
              <button type="button" style={styles.button} onClick={() => onGoClientTasks(drawerClient.uid)}>
                View this client’s tasks
              </button>
            </div>

            <div style={styles.drawerSection}>
              <div style={styles.drawerSectionTitle}>Message client</div>
              <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 800, marginBottom: 10 }}>
                Last outreach: <span style={{ fontWeight: 900 }}>{clientLastOutreachAtMs ? formatAgeShort(clientLastOutreachAtMs) : '—'}</span>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {CLIENT_MESSAGE_TEMPLATES.map((tpl) => {
                  const justCopied = clientCopied.templateId === tpl.id && (Date.now() - (clientCopied.atMs || 0)) < 2000;
                  return (
                    <div key={tpl.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 10, background: '#F9FAFB' }}>
                      <div style={{ fontSize: 13, color: '#111827', fontWeight: 700 }}>{tpl.text}</div>
                      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          style={justCopied ? { ...styles.buttonSecondary, background: '#111827', color: '#fff', borderColor: '#111827' } : styles.buttonSecondary}
                          onClick={() => onCopyClientTemplate({ templateId: tpl.id, text: tpl.text })}
                        >
                          {justCopied ? 'Copied' : 'Copy message'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Send via
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <a
                    href={sendVia.mailto || '#'}
                    onClick={(e) => { if (!sendVia.mailto) e.preventDefault(); }}
                    style={sendVia.mailto ? styles.drawerLinkBtn : { ...styles.drawerLinkBtn, opacity: 0.5, cursor: 'not-allowed' }}
                    title={!sendVia.hasCopied ? 'Copy a template first' : (!sendVia.email ? 'Client email not available' : '')}
                  >
                    Open email draft
                  </a>
                  <a
                    href={sendVia.sms || '#'}
                    onClick={(e) => { if (!sendVia.sms) e.preventDefault(); }}
                    style={sendVia.sms ? styles.drawerLinkBtn : { ...styles.drawerLinkBtn, opacity: 0.5, cursor: 'not-allowed' }}
                    title={!sendVia.hasCopied ? 'Copy a template first' : (!sendVia.phone ? 'Client phone not available' : '')}
                  >
                    Open SMS draft
                  </a>
                  {sendVia.phone ? (
                    <a
                      href={sendVia.whatsapp || '#'}
                      onClick={(e) => { if (!sendVia.whatsapp) e.preventDefault(); }}
                      target="_blank"
                      rel="noreferrer"
                      style={sendVia.whatsapp ? styles.drawerLinkBtn : { ...styles.drawerLinkBtn, opacity: 0.5, cursor: 'not-allowed' }}
                      title={!sendVia.hasCopied ? 'Copy a template first' : ''}
                    >
                      Open WhatsApp Web
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            <div style={styles.drawerDanger}>
              <div style={{ fontWeight: 900, color: '#9f1239', marginBottom: 8 }}>Danger zone</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
                Disabling is a last-resort safety control. It immediately prevents sign-in and posting new tasks.
              </div>
              <button
                type="button"
                style={{ ...styles.button, backgroundColor: '#DC3545' }}
                onClick={onOpenDisableClient}
                disabled={drawerClient.status !== 'active'}
                title={drawerClient.status !== 'active' ? 'Already disabled' : 'Disable account'}
              >
                Disable account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ClientDetailsDrawer);
