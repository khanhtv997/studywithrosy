import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { eduApi } from '../../api/client';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Users,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from 'lucide-react';
import { computeItemAnalysis, computeKnowledgeGaps, isAnswerCorrect } from '../../utils/assessmentLogic';
import { SelectField } from '../ui/SelectField';
import { PageHeader, StatCard } from '../ui/PageHeader';
import { RichText } from '../ui/RichText';
import { useI18n } from '../../i18n';

interface TeacherAnalyticsProps {
  initialAssessmentId?: string;
}

export const TeacherAnalytics: React.FC<TeacherAnalyticsProps> = ({ initialAssessmentId }) => {
  const { assessments, submissions } = useApp();
  const { t } = useI18n();

  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>(
    initialAssessmentId || assessments[0]?.id || ''
  );
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const selectedAssessment =
    assessments.find((a) => a.id === selectedAssessmentId) || assessments[0];
  const assessmentSubmissions = submissions.filter(
    (s) => s.assessmentId === selectedAssessment?.id
  );

  // Compute Item Analysis & Knowledge Gaps
  const itemAnalyses = selectedAssessment
    ? computeItemAnalysis(selectedAssessment, assessmentSubmissions)
    : [];
  const knowledgeGaps = selectedAssessment
    ? computeKnowledgeGaps(selectedAssessment, assessmentSubmissions)
    : [];

  // Summary Metrics
  const totalSubmissions = assessmentSubmissions.length;
  const avgScore =
    totalSubmissions > 0
      ? Math.round(
          (assessmentSubmissions.reduce(
            (acc, s) => acc + (s.finalScore !== null ? s.finalScore : s.autoScore),
            0
          ) /
            totalSubmissions) *
            10
        ) / 10
      : 0;

  // Weakest questions (sorted by highest error rate)
  const topWrongQuestions = [...itemAnalyses].sort((a, b) => b.errorRate - a.errorRate);

  // Call AI analytics
  const handleGenerateAiAnalytics = async () => {
    if (!selectedAssessment) return;
    setIsLoadingAi(true);
    setAiError(null);

    try {
      const data = await eduApi.analysis({
          assessmentTitle: selectedAssessment.title,
          avgScore,
          totalStudents: totalSubmissions,
          weakTopics: knowledgeGaps.filter((g) => g.status === 'weak' || g.status === 'moderate'),
          topWrongQuestions: topWrongQuestions.slice(0, 3).map((q) => ({
            order: q.order,
            text: q.text,
            errorRate: `${q.errorRate}%`,
            mostCommonDistractor: q.mostCommonDistractor,
            grammarTopic: q.grammarTopic,
          })),
      });
      if (data.success && data.analysis) {
        setAiAnalysis(data.analysis);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('Không tạo được phân tích.'));
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader icon={BarChart3} title={t('Kết quả học tập')}
        description={t('Những câu nhiều học sinh làm sai và chủ điểm cần ôn tập, theo từng đề.')}
        actions={<SelectField ariaLabel={t('Chọn đề thi')} value={selectedAssessment?.id || ''} onValueChange={value => { setSelectedAssessmentId(value); setAiAnalysis(null); }}
            className="w-full sm:w-80" placeholder={t('Chọn đề thi')} options={assessments.map(item => ({ value: item.id, label: item.title }))} />} />

      <div className="stat-grid">
        <StatCard icon={Users} label={t('Bài đã nộp')} value={totalSubmissions} />
        <StatCard icon={TrendingUp} label={t('Điểm trung bình')} value={`${avgScore} / 10`} tone="emerald" />
        <StatCard icon={AlertTriangle} label={t('Câu sai từ 50% trở lên')} value={itemAnalyses.filter(q => q.errorRate >= 50).length} tone="rose" />
        <StatCard icon={BookOpen} label={t('Chủ điểm cần củng cố')} value={knowledgeGaps.filter(g => g.status === 'weak').length} tone="amber" />
      </div>

      {/* AI Pedagogical Summary Section */}
      <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-teal-50 text-slate-900 rounded-2xl p-6 border border-indigo-100 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-base text-slate-900">
              {t('Gợi ý nội dung ôn tập')}
            </h3>
          </div>

          <button
            type="button"
            onClick={handleGenerateAiAnalytics}
            disabled={isLoadingAi || !selectedAssessment}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            {isLoadingAi ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('Đang tổng hợp kết quả...')}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{aiAnalysis ? t('Cập nhật gợi ý') : t('Xem gợi ý ôn tập')}</span>
              </>
            )}
          </button>
        </div>

        {aiError && <p role="alert" className="text-xs text-rose-700 mb-3">{aiError}</p>}

        {aiAnalysis ? (
          <div className="bg-white/80 rounded-xl p-4 text-xs text-slate-700 leading-relaxed border border-indigo-100 space-y-2 whitespace-pre-line">
            {aiAnalysis}
          </div>
        ) : (
          <p className="text-xs text-slate-600">
            {t('Tổng hợp các lỗi sai thường gặp và gợi ý nội dung ôn tập ngắn cho buổi học tiếp theo.')}
          </p>
        )}
      </div>

      {/* Main Grid: Item Analysis & Knowledge Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Question-by-Question Item Analysis */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{t('Câu hỏi học sinh thường làm sai')}</span>
              </h2>
              <p className="text-xs text-slate-700 mt-0.5">
                {t('Bao nhiêu bạn làm sai câu đó, tỷ lệ sai %, và phương án bẫy được chọn nhiều nhất')}
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
              {t('{count} câu hỏi', { count: itemAnalyses.length })}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {itemAnalyses.map((item) => {
              const isExpanded = expandedQuestionId === item.questionId;
              const hasHighError = item.errorRate >= 50;

              // Find students who got this question wrong
              const wrongStudents = assessmentSubmissions
                .filter((sub) => {
                  const q = selectedAssessment.questions.find((x) => x.id === item.questionId);
                  return q ? !isAnswerCorrect(q, sub.answers[q.id]) : false;
                })
                .map((sub) => ({
                  name: sub.studentName,
                  picked: sub.answers[item.questionId] || t('(Trống)'),
                }));

              return (
                <div key={item.questionId} className="p-4 hover:bg-slate-50/60 transition-colors">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedQuestionId(isExpanded ? null : item.questionId)}
                    className="flex w-full items-start justify-between gap-4 text-left cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0 mt-0.5 ${
                          hasHighError ? 'bg-rose-500' : 'bg-indigo-600'
                        }`}
                      >
                        {item.order}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                            {item.grammarTopic}
                          </span>
                          <span className="text-xs text-slate-700">
                            {t('Đáp án chuẩn:')} <strong className="text-emerald-700">{item.correctAnswer}</strong>
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-800 line-clamp-2"><RichText text={item.text} /></p>
                      </div>
                    </div>

                    {/* Error rate meter */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-2 justify-end">
                        <span
                          className={`text-xs font-bold ${
                            hasHighError ? 'text-rose-600' : 'text-slate-700'
                          }`}
                        >
                          {t('{wrong} / {total} bạn sai ({rate}%)', { wrong: item.incorrectCount, total: item.totalAttempts, rate: item.errorRate })}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-700" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-700" />
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="w-28 bg-slate-100 rounded-full h-2 mt-1.5 overflow-hidden ml-auto" aria-hidden="true">
                        <div
                          className={`h-full rounded-full transition-all ${
                            hasHighError ? 'bg-rose-500' : item.errorRate > 20 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${item.errorRate}%` }}
                        />
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail: Distractor analysis & student list */}
                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-slate-100 pl-10 space-y-3 text-xs animate-in fade-in duration-150">
                      {/* Distractor summary */}
                      <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80 text-amber-950 flex items-center justify-between">
                        <span>
                          <strong>{t('Phương án bẫy học sinh chọn nhầm nhiều nhất:')} </strong>
                          {item.mostCommonDistractor ? (
                            <span className="px-2 py-0.5 rounded-md bg-white border border-amber-300 font-bold text-rose-600 ml-1">
                              {t('Phương án {option}', { option: item.mostCommonDistractor })}
                            </span>
                          ) : (
                            t('Không có')
                          )}
                        </span>
                        <span className="text-[11px] text-amber-800">
                          {t('(Chiếm {count} lượt chọn)', { count: item.distractorCounts[item.mostCommonDistractor || ''] || 0 })}
                        </span>
                      </div>

                      {/* Students who got it wrong */}
                      <div>
                        <div className="font-bold text-slate-700 mb-1.5">
                          {t('Danh sách học sinh làm sai ({count} bạn):', { count: wrongStudents.length })}
                        </div>
                        {wrongStudents.length === 0 ? (
                          <span className="text-emerald-600 font-medium">
                            🎉 {t('Toàn bộ học sinh đều trả lời chính xác câu này!')}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {wrongStudents.map((ws, sIdx) => (
                              <span
                                key={sIdx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 font-medium"
                              >
                                <span>{ws.name}</span>
                                <span className="text-[10px] bg-rose-200 px-1 rounded font-bold">
                                  {t('chọn {answer}', { answer: ws.picked })}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Knowledge Gaps & Grammar Topic Mastery */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              {t('Chủ điểm Ngữ pháp hay mắc lỗi')}
            </h2>
            <p className="text-xs text-slate-700 mt-0.5">
              {t('Tổng hợp theo độ chính xác từ thấp đến cao')}
            </p>
          </div>

          <div className="space-y-3">
            {knowledgeGaps.map((gap, gIdx) => {
              let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
              if (gap.status === 'weak') {
                badgeColor = 'bg-rose-100 text-rose-800 border-rose-200';
              } else if (gap.status === 'moderate') {
                badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
              }

              return (
                <div
                  key={gIdx}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-slate-900 text-xs">{gap.topic}</span>
                    <span
                      className={`shrink-0 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}
                    >
                      {t('{rate}% chính xác', { rate: gap.accuracyRate })}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        gap.accuracyRate >= 80
                          ? 'bg-emerald-500'
                          : gap.accuracyRate >= 60
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${gap.accuracyRate}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-700 leading-relaxed">{gap.recommendation}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
