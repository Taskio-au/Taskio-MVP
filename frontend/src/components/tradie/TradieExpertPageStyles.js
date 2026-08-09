import React from 'react';

/**
 * Shared hover/focus and responsive rules for expert dashboard + tasks pages.
 */
export default function TradieExpertPageStyles() {
    return (
        <style>{`
                .tradie-job-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
                    border-color: #14C5C5;
                }
                .tradie-job-card:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-cta-btn:hover {
                    background-color: #12B0B0;
                    transform: translateY(-1px);
                }
                .tradie-cta-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-filter-pill:hover {
                    border-color: #14C5C5;
                    color: #14C5C5;
                }
                .tradie-filter-pill:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-profile-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-stripe-btn:hover {
                    background-color: #12B0B0;
                }
                .tradie-stripe-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-stripe-btn-secondary:hover {
                    background-color: #F0FAFA;
                }
                .tradie-stripe-btn-secondary:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-dismiss-btn:hover {
                    color: #222;
                }
                .tradie-view-all-tasks-btn:hover {
                    background-color: #F0FAFA;
                    border-color: #12B0B0;
                }
                .tradie-view-all-tasks-btn:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-view-more-tasks-link:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                    border-radius: 4px;
                }
                @media (min-width: 768px) {
                    .tradie-job-list.tradie-dashboard-attention-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (min-width: 1024px) {
                    .tradie-job-list.tradie-dashboard-attention-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }
                .tradie-menu-item:hover {
                    background-color: #FEF2F2;
                }
                .tradie-menu-item:focus {
                    outline: 2px solid #DC3545;
                    outline-offset: -2px;
                }

                .tradie-tasks-workspace-shell {
                    background-color: #F3F4F6;
                }
                .tradie-tasks-back-link:hover {
                    color: #374151;
                }
                .tradie-tasks-back-link:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                    border-radius: 4px;
                }
                .tradie-tasks-search-input:focus {
                    border-color: #14C5C5 !important;
                    background-color: #FFFFFF !important;
                    box-shadow: 0 0 0 3px rgba(20, 197, 197, 0.18);
                }
                .tradie-tasks-sort-select:focus {
                    border-color: #14C5C5 !important;
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(20, 197, 197, 0.18);
                }
                .tradie-tasks-controls .tradie-filter-pill {
                    padding: 8px 14px;
                    font-size: 13px;
                    border-radius: 999px;
                }
                .tradie-job-card.tradie-job-card-workspace:hover {
                    transform: translateY(-1px);
                    border-color: #D1D5DB;
                    box-shadow: 0 4px 14px rgba(0,0,0,0.07);
                }
                .tradie-job-card-workspace:focus {
                    outline: 2px solid #14C5C5;
                    outline-offset: 2px;
                }
                .tradie-job-list-workspace {
                    gap: 12px;
                    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
                }

                @media (max-width: 768px) {
                    .tradie-dashboard-container {
                        padding: 16px !important;
                    }
                    .tradie-needs-attention-panel {
                        padding: 16px !important;
                        margin-bottom: 28px !important;
                    }
                    .tradie-needs-attention-panel .tradie-view-all-tasks-btn {
                        width: 100%;
                        text-align: center;
                        min-height: 48px;
                    }
                    .tradie-needs-attention-panel .tradie-view-more-tasks-link {
                        width: 100%;
                        text-align: center;
                        min-height: 44px;
                    }
                    .tradie-job-list-workspace {
                        grid-template-columns: 1fr !important;
                        gap: 10px !important;
                    }
                    .tradie-stats-summary-wrap {
                        padding: 12px !important;
                    }
                    .tradie-stats-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 12px !important;
                    }
                    .tradie-job-list {
                        grid-template-columns: 1fr !important;
                        gap: 16px !important;
                    }
                    .tradie-job-card {
                        padding: 16px !important;
                    }
                    .tradie-cta-btn {
                        width: 100% !important;
                        padding: 14px 20px !important;
                        font-size: 15px !important;
                    }
                    .tradie-greeting {
                        font-size: 20px !important;
                    }
                    .tradie-filter-pills {
                        overflow-x: auto;
                        -webkit-overflow-scrolling: touch;
                        gap: 8px !important;
                    }
                    .tradie-stripe-banner {
                        flex-direction: column !important;
                        gap: 16px !important;
                    }
                    .tradie-tasks-toolbar {
                        flex-direction: column !important;
                        align-items: stretch !important;
                    }
                    .tradie-tasks-controls-primary-row {
                        flex-direction: column !important;
                        align-items: stretch !important;
                    }
                    .tradie-tasks-sort-select {
                        width: 100% !important;
                        min-width: 0 !important;
                        flex: 1 1 auto !important;
                    }
                    .tradie-tasks-search-input {
                        width: 100% !important;
                    }
                    .tradie-tasks-page .tradie-tasks-heading-row {
                        align-items: center !important;
                    }
                    .tradie-tasks-controls {
                        padding: 12px 14px !important;
                    }
                    .tradie-tasks-list-section h2,
                    .tradie-tasks-list-section .tasks-list-section-title {
                        font-size: 17px !important;
                    }
                }

                @media (max-width: 640px) {
                    .tradie-tasks-page {
                        padding-top: 12px !important;
                        padding-bottom: 24px !important;
                    }
                    .tradie-tasks-page .tradie-tasks-workspace-intro {
                        margin-bottom: 6px !important;
                    }
                    .tradie-tasks-page .tradie-tasks-heading-row {
                        margin-bottom: 4px !important;
                        gap: 6px 10px !important;
                    }
                    .tradie-tasks-page .tradie-greeting {
                        margin-bottom: 0 !important;
                    }
                    .tradie-tasks-page .tradie-tasks-sub {
                        margin-top: 0 !important;
                        font-size: 13px !important;
                        line-height: 1.42 !important;
                    }
                    .tradie-tasks-page .tradie-tasks-back-link {
                        font-size: 12px !important;
                        padding: 2px 0 !important;
                    }
                    .tradie-tasks-page .tradie-tasks-stripe-badge {
                        margin-bottom: 6px !important;
                        margin-top: 4px !important;
                        padding: 5px 10px !important;
                        font-size: 11px !important;
                    }
                    .tradie-tasks-controls {
                        padding: 10px 12px !important;
                        margin-bottom: 12px !important;
                    }
                    .tradie-tasks-controls-primary-row {
                        gap: 8px !important;
                    }
                    .tradie-tasks-search-input {
                        padding: 8px 12px !important;
                        min-height: 40px !important;
                        max-height: 44px !important;
                        font-size: 16px !important;
                        line-height: 1.25 !important;
                        background-color: #FFFFFF !important;
                        box-sizing: border-box !important;
                    }
                    .tradie-tasks-sort-select {
                        padding: 8px 12px !important;
                        min-height: 40px !important;
                        font-size: 14px !important;
                        box-sizing: border-box !important;
                    }
                    .tradie-tasks-filter-divider {
                        margin: 8px 0 8px 0 !important;
                    }
                    .tradie-tasks-list-section {
                        margin-top: 0 !important;
                    }
                    .tradie-tasks-list-section .tradie-tasks-list-header {
                        margin-bottom: 10px !important;
                    }
                }

                @media (max-width: 480px) {
                    .tradie-dashboard-container {
                        padding: 12px !important;
                    }
                    .tradie-stats-grid {
                        gap: 8px !important;
                    }
                    .tradie-needs-attention-panel {
                        padding: 14px !important;
                        border-left-width: 3px !important;
                    }
                    .tradie-job-card-workspace {
                        padding: 14px 14px !important;
                    }
                    .tradie-job-card-workspace .tradie-cta-btn {
                        min-height: 48px !important;
                    }
                }
            `}</style>
    );
}
