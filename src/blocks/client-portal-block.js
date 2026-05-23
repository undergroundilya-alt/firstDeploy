'use strict';

function portalResponsiveCss() {
  return `
/* Client portal responsive guard: desktop, tablets, vertical tablets and phones */
html,body{overflow-x:hidden}.top,.wrap{width:100%}.wrap{max-width:1180px}.card,.soft-panel,.account-project-card,.project-modal-card{max-width:100%}.nav,.top-inner,.account-project-top,.account-project-bottom{min-width:0}.project-install-snippet,pre{overflow-x:auto}.table{display:block;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}.project-modal-card{overscroll-behavior:contain}
@media (min-width:901px) and (max-width:1180px){.top-inner,.wrap{padding-left:24px;padding-right:24px}.grid.cols4{grid-template-columns:repeat(2,minmax(0,1fr))}.account-projects-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:681px) and (max-width:900px){.top-inner{align-items:center;flex-direction:row;flex-wrap:wrap}.portal-logo{min-width:auto}.nav{width:100%;justify-content:flex-start;gap:6px;overflow-x:auto;padding-bottom:4px}.nav a,.nav button{white-space:nowrap}.wrap{margin:24px auto;padding:0 18px}.grid.cols4,.grid.cols3,.split,.row,.account-projects-grid{grid-template-columns:1fr}.card{padding:20px}.project-modal{padding:18px}.project-modal-card{max-height:88vh}.swatches{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:680px){.top-inner{min-height:64px;align-items:flex-start;gap:10px;padding:12px 14px}.portal-logo{min-width:auto}.portal-logo img{width:36px;height:36px}.nav{width:100%;justify-content:flex-start;gap:5px;overflow-x:auto;flex-wrap:nowrap;padding:4px 0 2px;scrollbar-width:thin}.nav a,.nav button{white-space:nowrap;font-size:12px;padding:8px 9px}.portal-profile-menu{left:0;right:auto;min-width:210px}.wrap{margin:18px auto;padding:0 14px}.title{font-size:24px;line-height:1.12}.lead{font-size:14px;line-height:1.6}.grid.cols4,.grid.cols3,.split,.row,.account-projects-grid{grid-template-columns:1fr!important}.card,.soft-panel,.account-project-card{padding:16px;border-radius:18px}.account-summary{gap:6px}.account-chip{max-width:100%;white-space:normal;border-radius:16px}.account-project-top{display:block}.project-badges{justify-content:flex-start;margin-top:10px}.account-project-bottom{display:block}.account-project-bottom .btn{width:100%;justify-content:center;margin-bottom:10px}.project-mini-stats{font-size:13px}.project-install-snippet,pre{font-size:11px;padding:12px;border-radius:14px}.create-project-tile{min-height:118px;font-size:17px}.project-modal{align-items:end;padding:10px}.project-modal-card{width:100%;max-height:92vh;border-radius:22px;padding:18px}.swatches{grid-template-columns:1fr}.mini-chart{gap:4px;height:78px;padding:10px}.client-popover{left:14px;right:14px;top:auto;bottom:14px;max-width:none}.table th,.table td{font-size:12px;padding:10px 8px}}
@media (max-width:380px){.top-inner{padding-left:12px;padding-right:12px}.wrap{padding:0 12px}.nav a,.nav button{font-size:11px;padding:7px 8px}.card,.soft-panel,.account-project-card{padding:14px}.btn{width:100%;justify-content:center}.kpi .num{font-size:28px}}

/* v48 profile pop-up portal for account/admin pages: menu is fixed above the page, not part of header height. */
.portal-profile button:focus,.portal-profile button:focus-visible,.nav a:focus,.nav a:focus-visible{outline:none!important;box-shadow:none!important}
.portal-profile-menu.profile-menu-portal{display:none!important}
.portal-profile-menu.profile-menu-portal.profile-menu-portal-open{position:fixed!important;top:12px;left:12px;right:auto!important;bottom:auto!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;z-index:2147483647!important;width:min(236px,calc(100vw - 24px))!important;min-width:0!important;max-width:calc(100vw - 24px)!important;border-radius:18px!important;box-shadow:0 28px 80px rgba(0,0,0,.28)!important;transform:none!important}
.portal-profile-menu.profile-menu-portal:before,.portal-profile-menu.profile-menu-portal:after{display:none!important}
@media(max-width:680px){.top-inner{overflow:visible!important}.nav{overflow-x:visible!important;flex-wrap:wrap!important}.portal-profile{position:relative!important}.portal-profile-menu.profile-menu-portal.profile-menu-portal-open{width:min(236px,calc(100vw - 24px))!important}}

/* v49 account/admin header: profile pop-up is a fixed portal; never expands header height. */
.portal-profile-menu:not(.profile-menu-portal-open),
.portal-profile:hover .portal-profile-menu:not(.profile-menu-portal-open),
.portal-profile:focus-within .portal-profile-menu:not(.profile-menu-portal-open){display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}
.portal-profile-menu.profile-menu-portal.profile-menu-portal-open{position:fixed!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;z-index:2147483647!important;width:min(236px,calc(100vw - 24px))!important;max-width:calc(100vw - 24px)!important;min-width:0!important;overflow:hidden!important}
@media(max-width:680px){.top-inner{width:100%!important;max-width:100%!important;overflow:visible!important}.nav{width:100%!important;max-width:100%!important;overflow:visible!important;flex-wrap:wrap!important}.nav a,.nav button{display:inline-flex!important;align-items:center!important;justify-content:center!important}.portal-profile-menu.profile-menu-portal.profile-menu-portal-open{width:min(236px,calc(100vw - 24px))!important;max-width:calc(100vw - 24px)!important}}

`;
}

const clientPortalBlocks = {
  account: 'Client account, project cards, analytics entry, onboarding and project creation modal',
  emails: 'SMTP delivery, outbox debug, registration/reset/cancel test emails',
  site: 'Public marketing website and two SDK test sites'
};

module.exports = { portalResponsiveCss, clientPortalBlocks };
