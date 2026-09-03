import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: '/ojfc/',
  resolve: {
    alias: {
      // 암호 걸린 은행 엑셀 복호화(office-crypto)가 Node crypto를 쓰므로
      // 브라우저용 최소 구현으로 대체합니다.
      crypto: path.resolve(__dirname, 'src/lib/cryptoShim.ts'),
    },
  },
})
