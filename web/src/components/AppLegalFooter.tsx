import { isNativeApp } from '../lib/api-base';

import { LegalLinks } from './LegalLinks';



/** 平板 / App 底部合规链接（商店审核常用） */

export function AppLegalFooter() {

  return (

    <footer

      className={`flex flex-col items-center justify-center gap-1 px-4 py-2 text-center text-[9px] text-gray-600 ${

        isNativeApp() ? 'safe-area-pb' : ''

      }`}

    >

      <LegalLinks />

      <span>WUXIAN ZHI 3.5</span>

    </footer>

  );

}

