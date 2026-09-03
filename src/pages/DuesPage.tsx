import { useState, useEffect, useRef } from 'react';
import {
  Wallet, Check, Share2, Plus, Trash2, FileSpreadsheet, Loader2,
  TrendingUp, TrendingDown, X,
} from 'lucide-react';
import {
  getMembers, getCurrentUser, subscribe, isAdmin,
  getDuesAll, getDuesMonth, ensureDuesMonth, setDuesAmount,
  setDuesPaid, setDuesExempt, addDuesExpense, deleteDuesExpense,
} from '../lib/store';
import type { Member, DuesMonth } from '../lib/types';

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${y}년 ${parseInt(m, 10)}월`;
}
function monthShort(key: string): string {
  return `${parseInt(key.split('-')[1], 10)}월`;
}
function won(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

// 최근 12개월 + 장부가 있는 달
function buildMonthOptions(dues: DuesMonth[]): string[] {
  const keys = new Set<string>();
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    keys.add(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  dues.forEach(d => keys.add(d.id));
  return Array.from(keys).sort((a, b) => b.localeCompare(a));
}

type ParsedRow = { name: string; memberId: string | null; amount: number; raw: string };

export default function DuesPage() {
  const admin = isAdmin();
  const me = getCurrentUser();

  const [members, setMembers] = useState<Member[]>(getMembers());
  const [dues, setDues] = useState<DuesMonth[]>(getDuesAll());
  const [monthKey, setMonthKey] = useState<string>(monthKeyOf(new Date()));

  useEffect(() => {
    return subscribe(() => {
      setMembers(getMembers());
      setDues(getDuesAll());
    });
  }, []);

  const cur = getDuesMonth(monthKey);
  const amount = cur?.amount ?? 0;
  const paidMap = cur?.paid ?? {};
  const exempt = cur?.exempt ?? [];
  const expenses = cur?.expenses ?? [];

  const [amountDraft, setAmountDraft] = useState<string>('');
  const [expLabel, setExpLabel] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [showExpenses, setShowExpenses] = useState(false);

  // 엑셀 업로드 상태
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => { setAmountDraft(String(cur?.amount ?? '')); }, [monthKey, cur?.amount]);

  if (!admin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center">
          <Wallet size={36} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-500 font-medium">접근 권한이 없습니다</p>
          <p className="text-xs text-gray-400 mt-1">회비 관리는 운영진만 볼 수 있습니다</p>
        </div>
      </div>
    );
  }

  // 집계
  const targets = members.filter(m => !exempt.includes(m.id));
  const paidMembers = targets.filter(m => paidMap[m.id]);
  const unpaidMembers = targets.filter(m => !paidMap[m.id]);
  const income = paidMembers.length * amount;
  const spent = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const balance = income - spent;
  const rate = targets.length > 0 ? Math.round((paidMembers.length / targets.length) * 100) : 0;

  // 월별 히스토리 (장부 있는 달만, 최신 6개)
  const history = dues.slice(0, 6).map(d => {
    const tg = members.filter(m => !(d.exempt || []).includes(m.id));
    const pd = tg.filter(m => (d.paid || {})[m.id]);
    return {
      key: d.id,
      rate: tg.length ? Math.round((pd.length / tg.length) * 100) : 0,
      done: tg.length > 0 && pd.length === tg.length,
      paid: pd.length,
      total: tg.length,
    };
  });

  const handleShareUnpaid = async () => {
    const names = unpaidMembers.map(m => m.name).join(', ');
    const text = names
      ? `${monthLabel(monthKey)} 회비 미납 안내\n\n금액: ${won(amount)}\n미납: ${names}\n\n확인 부탁드립니다!`
      : `${monthLabel(monthKey)} 회비 전원 납부 완료되었습니다. 감사합니다!`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      alert('복사되었습니다. 카톡에 붙여넣기 하세요!');
    } catch { prompt('아래 내용을 복사하세요:', text); }
  };

  // 엑셀 파싱 — 입금자명을 멤버 이름과 대조
  const handleFile = async (file: File) => {
    setParsing(true);
    setParsed(null);
    try {
      const XLSX = await import('xlsx'); // 필요할 때만 로드
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const rows: unknown[][] = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
        rows.push(...arr);
      }

      const found: ParsedRow[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (!Array.isArray(row) || row.length === 0) continue;
        const cells = row.map(c => (c == null ? '' : String(c)));
        const raw = cells.join(' ').replace(/\s+/g, ' ').trim();
        if (!raw) continue;

        // 이 행에서 가장 긴(구체적인) 멤버 이름 매칭
        let matched: Member | null = null;
        for (const m of members) {
          if (!m.name) continue;
          if (raw.includes(m.name) && (!matched || m.name.length > matched.name.length)) matched = m;
        }
        if (!matched) continue;

        // 금액: 숫자 셀 중 가장 큰 값 (날짜/잔액과 섞일 수 있어 회비 근처값 우선)
        const nums = cells
          .map(c => Number(String(c).replace(/[,\s원]/g, '')))
          .filter(n => Number.isFinite(n) && n >= 1000);
        if (nums.length === 0) continue;
        const amt = amount > 0
          ? nums.reduce((best, n) => (Math.abs(n - amount) < Math.abs(best - amount) ? n : best), nums[0])
          : Math.min(...nums);

        const key = matched.id;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ name: matched.name, memberId: matched.id, amount: amt, raw: raw.slice(0, 60) });
      }

      setParsed(found);
      setPicked(new Set(found.filter(f => f.memberId).map(f => f.memberId!)));
    } catch (err) {
      console.error(err);
      alert('엑셀을 읽지 못했습니다. 파일 형식을 확인해주세요.');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyParsed = async () => {
    await ensureDuesMonth(monthKey, amount);
    for (const id of picked) {
      await setDuesPaid(monthKey, id, true);
    }
    setParsed(null);
    setPicked(new Set());
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white px-5 pt-10 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Wallet size={20} /> 회비 관리
            </h1>
            <p className="text-blue-200 text-sm mt-1">
              {amount > 0 ? `1인 ${won(amount)}` : '금액 미설정'}
              {targets.length > 0 && <span className="ml-2">· {paidMembers.length}/{targets.length}명 ({rate}%)</span>}
            </p>
          </div>
          <select
            value={monthKey}
            onChange={e => { setMonthKey(e.target.value); setParsed(null); }}
            className="bg-white/10 backdrop-blur border border-white/20 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            {buildMonthOptions(dues).map(k => (
              <option key={k} value={k} className="text-gray-800">{monthLabel(k)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* 월별 히스토리 */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-2.5">월별 현황</h2>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {history.map(h => (
                <button
                  key={h.key}
                  onClick={() => { setMonthKey(h.key); setParsed(null); }}
                  className={`shrink-0 px-3 py-2 rounded-xl border transition-colors ${
                    h.key === monthKey ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white' : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className={`text-xs font-bold ${h.key === monthKey ? 'text-white' : 'text-gray-700'}`}>
                    {monthShort(h.key)}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${
                    h.key === monthKey ? 'text-blue-200' : h.done ? 'text-green-600' : 'text-amber-600'
                  }`}>
                    {h.done ? '완료' : `${h.paid}/${h.total}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 금액 설정 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">{monthLabel(monthKey)} 회비 금액</h2>
          <div className="flex gap-2">
            <input
              type="number" inputMode="numeric" min={0} step={1000}
              value={amountDraft}
              onChange={e => setAmountDraft(e.target.value)}
              placeholder="예: 10000"
              className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/40"
            />
            <button
              onClick={async () => {
                const v = Number(amountDraft) || 0;
                await ensureDuesMonth(monthKey, v);
                await setDuesAmount(monthKey, v);
              }}
              className="px-4 py-2.5 bg-[#16a34a] text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors"
            >
              저장
            </button>
          </div>
        </div>

        {/* 엑셀 업로드 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-1.5">
            <FileSpreadsheet size={15} className="text-emerald-600" /> 입금내역 엑셀 업로드
          </h2>
          <p className="text-[11px] text-gray-400 mb-3">
            카카오뱅크 거래내역 파일을 올리면 입금자명을 멤버와 대조해 자동 체크합니다
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="w-full py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold hover:bg-emerald-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {parsing ? <><Loader2 size={15} className="animate-spin" /> 읽는 중...</> : <><FileSpreadsheet size={15} /> 엑셀 파일 선택</>}
          </button>

          {/* 파싱 결과 */}
          {parsed && (
            <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-[11px] font-bold text-gray-600">
                  {parsed.length}건 찾음 · {picked.size}건 선택
                </span>
                <button onClick={() => setParsed(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
              {parsed.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4 px-3">
                  멤버 이름과 일치하는 입금 내역을 찾지 못했습니다.<br />
                  아래에서 직접 체크해주세요.
                </p>
              ) : (
                <>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                    {parsed.map(r => {
                      const on = r.memberId ? picked.has(r.memberId) : false;
                      return (
                        <button
                          key={r.memberId ?? r.raw}
                          onClick={() => {
                            if (!r.memberId) return;
                            const next = new Set(picked);
                            if (next.has(r.memberId)) next.delete(r.memberId); else next.add(r.memberId);
                            setPicked(next);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left"
                        >
                          <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                            on ? 'bg-[#16a34a]' : 'border border-gray-300'
                          }`}>
                            {on && <Check size={11} className="text-white" />}
                          </span>
                          <span className="text-sm font-medium text-gray-800 flex-1">{r.name}</span>
                          <span className="text-xs text-gray-500">{won(r.amount)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={applyParsed}
                    disabled={picked.size === 0}
                    className="w-full py-2.5 bg-[#1e3a5f] text-white text-sm font-bold disabled:bg-gray-300 transition-colors"
                  >
                    {picked.size}명 납부 처리
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* 납부 체크 리스트 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-700">
              납부 체크
              <span className="ml-2 text-[11px] font-medium text-gray-400">{paidMembers.length}/{targets.length}명</span>
            </h2>
            <button
              onClick={handleShareUnpaid}
              className="flex items-center gap-1 text-[11px] font-bold text-[#1e3a5f] px-2.5 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <Share2 size={12} /> 미납 공유
            </button>
          </div>

          <div className="px-4 pt-3">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#16a34a] rounded-full transition-all" style={{ width: `${rate}%` }} />
            </div>
          </div>

          <div className="divide-y divide-gray-50 mt-2">
            {members.map(m => {
              const isExempt = exempt.includes(m.id);
              const isPaid = !!paidMap[m.id];
              return (
                <div key={m.id} className="flex items-center gap-2 px-4 py-2.5">
                  {/* 체크박스 = 납부 토글 */}
                  <button
                    onClick={async () => {
                      if (isExempt) return;
                      await ensureDuesMonth(monthKey, amount);
                      await setDuesPaid(monthKey, m.id, !isPaid);
                    }}
                    disabled={isExempt}
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                      isExempt ? 'bg-gray-100' : isPaid ? 'bg-[#16a34a]' : 'border-2 border-gray-300 hover:border-[#16a34a]'
                    }`}
                  >
                    {isPaid && !isExempt && <Check size={14} className="text-white" />}
                  </button>

                  <span className={`flex-1 text-sm font-medium truncate ${isExempt ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {m.name}
                    {m.id === me?.id && <span className="ml-1 text-[10px] text-blue-500 font-bold">나</span>}
                  </span>

                  {isPaid && !isExempt && paidMap[m.id] && (
                    <span className="text-[10px] text-gray-400">
                      {new Date(paidMap[m.id]).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    </span>
                  )}

                  <button
                    onClick={async () => {
                      await ensureDuesMonth(monthKey, amount);
                      await setDuesExempt(monthKey, m.id, !isExempt);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                      isExempt ? 'bg-gray-400 text-white' : 'bg-gray-50 text-gray-400 border border-gray-200'
                    }`}
                  >
                    면제
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
            <div className="w-8 h-8 mx-auto mb-1.5 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
              <TrendingUp size={15} />
            </div>
            <p className="text-sm font-bold text-gray-800 leading-none">{won(income)}</p>
            <p className="text-[10px] text-gray-400 mt-1">수입</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
            <div className="w-8 h-8 mx-auto mb-1.5 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
              <TrendingDown size={15} />
            </div>
            <p className="text-sm font-bold text-gray-800 leading-none">{won(spent)}</p>
            <p className="text-[10px] text-gray-400 mt-1">지출</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
            <div className="w-8 h-8 mx-auto mb-1.5 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Wallet size={15} />
            </div>
            <p className={`text-sm font-bold leading-none ${balance < 0 ? 'text-red-600' : 'text-gray-800'}`}>{won(balance)}</p>
            <p className="text-[10px] text-gray-400 mt-1">잔액</p>
          </div>
        </div>

        {/* 지출 (접기) */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <button
            onClick={() => setShowExpenses(!showExpenses)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="text-sm font-bold text-gray-700">
              지출 내역
              {expenses.length > 0 && <span className="ml-2 text-[11px] text-gray-400">{expenses.length}건</span>}
            </h2>
            <span className="text-[11px] text-gray-400">{showExpenses ? '접기' : '열기'}</span>
          </button>

          {showExpenses && (
            <div className="mt-3">
              {expenses.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {expenses.map(e => (
                    <div key={e.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm text-gray-800">{e.label}</span>
                      <span className="text-sm font-bold text-red-500">-{won(e.amount)}</span>
                      <button
                        onClick={() => { if (confirm('이 지출을 삭제할까요?')) deleteDuesExpense(monthKey, e.id); }}
                        className="text-gray-300 hover:text-red-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={expLabel}
                  onChange={e => setExpLabel(e.target.value)}
                  placeholder="내역 (구장비 등)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                <input
                  type="number" inputMode="numeric" min={0}
                  value={expAmount}
                  onChange={e => setExpAmount(e.target.value)}
                  placeholder="금액"
                  className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                <button
                  onClick={async () => {
                    const v = Number(expAmount) || 0;
                    if (!expLabel.trim() || v <= 0) return;
                    await ensureDuesMonth(monthKey, amount);
                    await addDuesExpense(monthKey, expLabel, v);
                    setExpLabel(''); setExpAmount('');
                  }}
                  disabled={!expLabel.trim() || !expAmount}
                  className="px-3 py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-bold disabled:bg-gray-300 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
