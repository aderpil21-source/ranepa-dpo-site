// Движок цифрового ассистента «Сова».
// Здесь находятся: UI-помощники чата, маршрутизация, контекст, поиск программ,
// обычный/расширенный режим, FAQ-маршруты и профориентационный сценарий.
// Словари, интенты, синонимы и статические правила — в owl-brain.js.
// Обучаемая память — в owl-learning.js.

function safeOwlHttpUrl(value) {
    try {
        const url = new URL(String(value || '').trim(), location.origin);
        return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
    } catch (error) {
        return '';
    }
}

function safeOwlContactHref(value, fallback) {
    const raw = String(value || fallback || '').trim();
    try {
        const url = new URL(raw, location.origin);
        if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:' || url.protocol === 'tel:') {
            return url.href;
        }
    } catch (error) {}
    return '';
}

function escapeOwlJsString(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function escapeOwlText(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

// Старое перелетание удалено: сова остается на ветке.
function owlFlyToPrograms() {
    const bubble = document.getElementById('owlBubble');
    if (bubble) bubble.classList.remove('show');
}

function normalizeText(s) {
    return (s || '').toLowerCase().replace(/[«»"'.,!?;:()]/g, '').replace(/\s+/g, ' ').trim();
}
function matchScore(query, title) {
    const normalizedQuery = normalizeText(query);
    const normalizedTitle = normalizeText(title);
    if (normalizedTitle && normalizedTitle.length >= 8 && normalizedQuery.includes(normalizedTitle)) {
        return 1;
    }

    const qWords = normalizedQuery.split(' ').filter(w => w.length > 2);
    const tWords = normalizedTitle.split(' ').filter(w => w.length > 2);
    if (!qWords.length || !tWords.length) return 0;
    let hits = 0;
    qWords.forEach(qw => { if (tWords.some(tw => tw.includes(qw) || qw.includes(tw))) hits++; });
    return hits / qWords.length;
}

function owlProgramProbability(query, program) {
    if (!program) return 0;
    const q = owlSmartNormalize(query);
    if (!q) return 0;

    const title = currentLang === 'ru' ? (program.title_ru || '') : (program.title_en || program.title_ru || '');
    const description = currentLang === 'ru'
        ? [program.desc_ru,program.long_desc_ru,program.official_desc_ru].filter(Boolean).join(' ')
        : [program.desc_en,program.long_desc_en,program.official_desc_en,program.desc_ru].filter(Boolean).join(' ');
    const metadata = [program.type,program.format,program.hours,program.price,program.sector,(program.bullets_ru||[]).join(' '),(program.topics_ru||'')].join(' ');

    const titleScore = matchScore(q, title);
    const descriptionScore = matchScore(q, description);
    const metaScore = matchScore(q, metadata);
    let score = titleScore * 0.56 + descriptionScore * 0.24 + metaScore * 0.20;

    if (String(owlConversationState.lastProgramId || '') === String(program.id || '')) score += 0.08;
    if ((owlConversationState.lastCandidateIds || []).map(String).includes(String(program.id || ''))) score += 0.04;

    const nq = normalizeText(q);
    const format = normalizeText(program.format || '');
    const type = normalizeText(program.type || '');
    if (/онлайн|дистанц|удален|дот|электрон/.test(nq) && /дот|эо|дистанц|онлайн/.test(format)) score += 0.12;
    if (/переподготов/.test(nq) && /переподготов/.test(type)) score += 0.12;
    if (/повышен.*квалификац|повысить квалификац/.test(nq) && /повышен.*квалификац/.test(type)) score += 0.12;
    if (/проф.*обуч/.test(nq) && /профессиональн.*обуч/.test(type)) score += 0.12;

    return Math.max(0, Math.min(1, score));
}

function findProgramsExplicitlyNamed(query) {
    const normalizedQuery = normalizeText(query);
    const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';

    return globalPrograms.filter(program => {
        const title = normalizeText(program[titleKey] || '');
        return title.length >= 8 && normalizedQuery.includes(title);
    });
}

function owlSafeContextText(value) {
    return String(value || '')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/[\w.+-]+@[\w.-]+\.[a-zа-я]{2,}/gi, ' ')
        .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}

function owlRecentConversationContext() {
    const nodes = Array.from(chatBody ? chatBody.querySelectorAll('.msg-user,.msg-bot') : []);
    return nodes.slice(-8).map(node => ({
        role: node.classList.contains('msg-user') ? 'user' : 'assistant',
        text: owlSafeContextText(node.textContent || '')
    })).filter(item => item.text);
}

const OWL_AI_ENDPOINT = 'https://functions.yandexcloud.net/d4eatbt80ae5r5402i3g';
let owlAiRequestInFlight = false;

function setOwlAiBusy(busy) {
    owlAiRequestInFlight = !!busy;
    const input = document.getElementById('chatUserInput');
    const button = document.querySelector('.chat-send-btn');
    if (input) input.disabled = !!busy;
    if (button) {
        button.disabled = !!busy;
        button.style.opacity = busy ? '.55' : '';
        button.style.cursor = busy ? 'wait' : '';
    }
}

async function askOwlAI(message) {
    if (owlAiRequestInFlight) return;

    setOwlAiBusy(true);
    showOwlThinking();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
        const response = await fetch(OWL_AI_ENDPOINT, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-store',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: String(message || '').slice(0, 800),
                conversation: owlRecentConversationContext(),
                conversationState: {
                    mode: owlConversationState.mode,
                    lastIntent: owlConversationState.lastIntent || '',
                    lastProgramId: owlConversationState.lastProgramId || '',
                    lastCandidateIds: (owlConversationState.lastCandidateIds || []).slice(0, 8)
                },
                pageContext: {
                    site: 'ranepa-dpo39.ru',
                    page: location.pathname || '/',
                    alreadyOnSite: true
                }
            })
        });

        let data = null;
        try { data = await response.json(); } catch (e) {}

        if (!response.ok || !data || !data.answer) {
            console.warn('AI backend response:', {
                status: response.status,
                ok: response.ok,
                error: data && data.error ? data.error : null
            });
            throw new Error('assistant_unavailable');
        }

        removeOwlThinking();

        let answerText = String(data.answer || '').trim();

        // Посетитель уже находится на ranepa-dpo39.ru.
        // Убираем бессмысленные рекомендации "посетить сайт" из ответа модели.
        answerText = answerText
            .replace(/Для получения подробной информации[^.?!]*ranepa-dpo39\.ru\.?/gi, '')
            .replace(/Рекомендую посетить[^.?!]*ranepa-dpo39\.ru\.?/gi, '')
            .replace(/Посетите[^.?!]*ranepa-dpo39\.ru\.?/gi, '')
            .replace(/На сайте ranepa-dpo39\.ru[^.?!]*[.?!]?/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();

        if (!answerText) {
            answerText = currentLang === 'ru'
                ? 'Могу помочь подобрать программу, уточнить стоимость, сроки, форму обучения или документы.'
                : 'I can help you choose a program or clarify tuition, duration, format, or required documents.';
        }

        // Если расширенный режим назвал ровно одну программу из реального каталога,
        // она становится подтверждённым объектом следующего вопроса.
        const mentionedPrograms = globalPrograms.filter(program => {
            const title = String(program[currentLang === 'ru' ? 'title_ru' : 'title_en'] || '').trim();
            return title.length >= 8 && answerText.toLowerCase().includes(title.toLowerCase());
        });
        if (mentionedPrograms.length === 1) {
            owlRememberProgram(mentionedPrograms[0]);
        }

        // Факты о найденной реальной программе всегда дополняем данными каталога,
        // чтобы цена/часы не зависели от генеративного ответа.
        let verifiedProgramFacts = '';
        if (mentionedPrograms.length === 1) {
            const verified = mentionedPrograms[0];
            const verifiedPrice = localizedProgramMeta(verified, 'price', currentLang);
            const verifiedHours = localizedProgramMeta(verified, 'hours', currentLang);
            verifiedProgramFacts =
                '<br><br><span class="owl-guided-hint"><b>Проверено по каталогу:</b> ' +
                (verifiedPrice ? '💰 ' + escapeOwlText(verifiedPrice) : '') +
                (verifiedPrice && verifiedHours ? ' · ' : '') +
                (verifiedHours ? '⏱ ' + escapeOwlText(verifiedHours) : '') +
                '</span>';
        }

        const safeAnswer = escapeOwlText(answerText).replace(/\n/g, '<br>');
        addBotMsg(
            safeAnswer + verifiedProgramFacts +
            (currentLang === 'ru'
                ? '<br><br><span class="owl-guided-hint">Можно продолжить: уточните стоимость, сроки, документы, преподавателя или попросите подобрать другой вариант.</span>'
                : '<br><br><span class="owl-guided-hint">You can continue by asking about tuition, duration, documents, instructors, or another option.</span>')
        );
        const contextualProgram = owlLastProgramContext();
        if (contextualProgram) {
            setOptions(owlProgramActionOptions(contextualProgram));
        } else {
            setOptions(
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'подбери программу по теме\')">🔎 Подобрать программу</button>' +
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'какие документы нужны для поступления\')">📎 Документы</button>' +
                '<button class="chat-opt-btn" onclick="showOwlHelp()">💡 Что ещё умеет Сова</button>'
            );
        }
        owlResetUnresolved();
        owlConversationState.advancedNegativeCount = 0;
        saveOwlConversationState();
    } catch (error) {
        removeOwlThinking();
        console.warn('AI assistant fallback:', error && error.name ? error.name : error);
        const failures = owlRegisterUnresolved();
        const escalation = owlBrainConfig().escalation || {};
        if (failures >= Number(escalation.humanHandoffAfter || 4)) {
            showOwlHumanHandoff('repeated');
        } else {
            addBotMsg(
                currentLang === 'ru'
                    ? 'Сейчас не удалось получить расширенный ответ. Я могу попробовать помочь через каталог или передать вас сотруднику Центра.'
                    : 'I could not get an extended answer right now. I can use the catalog or connect you with the Center staff.'
            );
            if (failures >= Number(escalation.softOfferAfter || 2)) {
                setOptions(
                    '<button class="chat-opt-btn" onclick="offerAllPrograms(true)">📚 Каталог программ</button>' +
                    owlContactOptions()
                );
            } else {
                offerAllPrograms(true);
            }
        }
    } finally {
        clearTimeout(timer);
        removeOwlThinking();
        setOwlAiBusy(false);
        const input = document.getElementById('chatUserInput');
        if (input) input.focus();
    }
}

function owlResolveSiteFaq(query) {
    const raw = normalizeText(String(query || '').replace(/ё/g, 'е')).trim();
    if (!raw) return null;

    const hasDocumentWord = /документ[а-я-]*/i.test(raw);
    const asksAdmissionDocs =
        hasDocumentWord &&
        (
            /(нужн[а-я]*|требу[а-я]*|принести|предоставить|подавать|подать)/i.test(raw) ||
            /(для поступлен[а-я]*|для запис[а-я]*|для зачислен[а-я]*|при поступлен[а-я]*|при зачислен[а-я]*)/i.test(raw)
        );

    const asksOutcomeDoc =
        (
            /(какой|какие|что).*?(документ[а-я]*|диплом[а-я]*|удостоверен[а-я]*|сертификат[а-я]*)/i.test(raw) &&
            /(выда[а-я]*|получ[а-я]*|после обучен[а-я]*|после окончан[а-я]*|по окончан[а-я]*|итог[а-я]*)/i.test(raw)
        ) ||
        /(что выдают|что получу|диплом после|удостоверение после|документ после|фрдо)/i.test(raw);

    const bareDocuments = /^документ[а-я-]*$/i.test(raw);

    if (asksAdmissionDocs) {
        const facts = (owlBrainConfig().siteFacts || {}).admissionDocuments || {};
        const items = Array.isArray(facts.items) ? facts.items : [];
        const list = items.length
            ? items.map((item, index) => '• ' + escapeOwlText(item) + (index === items.length - 1 ? '.' : ';')).join('<br>')
            : '• копия паспорта;<br>• СНИЛС;<br>• документ о текущем образовании — диплом СПО или ВО.';

        return {
            handled:true,
            html:
                '<b>Для оформления договора нужны:</b><br>' +
                list +
                '<br><br><span class="owl-guided-hint">Источник: ' +
                escapeOwlText(facts.source || 'FAQ на сайте') + '.</span>',
            options:
                '<button class="chat-opt-btn" onclick="openModal()">✍️ Перейти к записи</button>' +
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'какой документ выдают после обучения\')">🎓 Что выдадут после обучения</button>' +
                '<button class="chat-opt-btn" onclick="resetMenu()">← В меню</button>',
            intent:'faq-admission-documents'
        };
    }

    if (asksOutcomeDoc) {
        const facts = (owlBrainConfig().siteFacts || {}).outcomeDocuments || {};
        const byType = facts.byType || {};
        const pk = byType['повышение квалификации'] || 'удостоверение о повышении квалификации';
        const pp = byType['профессиональная переподготовка'] || byType['проф. переподготовка'] || 'диплом о профессиональной переподготовке';

        return {
            handled:true,
            html:
                '<b>Документ зависит от вида программы:</b><br>' +
                '• повышение квалификации — <b>' + escapeOwlText(pk) + '</b>;<br>' +
                '• профессиональная переподготовка — <b>' + escapeOwlText(pp) + '</b>.' +
                '<br><br>На сайте указано, что сведения о таких документах вносятся в <b>ФИС ФРДО</b>.' +
                '<br><br><span class="owl-guided-hint">Если назовёте конкретную программу, я уточню документ именно по ней. Источник: ' +
                escapeOwlText(facts.source || 'раздел «Официальные документы об образовании» на сайте') + '.</span>',
            options:
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'какие документы нужны для поступления\')">📎 Документы для поступления</button>' +
                '<button class="chat-opt-btn" onclick="resetMenu()">← В меню</button>',
            intent:'faq-outcome-documents'
        };
    }

    if (bareDocuments) {
        return {
            handled:true,
            html:'Уточните: нужны <b>документы для поступления</b> или вы хотите узнать, <b>какой документ выдадут после обучения</b>?',
            options:
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'какие документы нужны для поступления\')">📎 Для поступления</button>' +
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'какой документ выдают после обучения\')">🎓 После обучения</button>',
            intent:'faq-documents-clarify'
        };
    }

    return null;
}

async function owlApplyLearnedRule(rule, currentQuery) {
    if (!rule || !rule.action) return false;

    if (rule.action === 'staff') {
        // Learned mappings may never reveal staff/contact data without an explicit request in the current message.
        if (!owlIsExplicitStaffRequest(currentQuery || '')) return false;
        const person = owlStaffByKey(rule.value);
        if (!person) return false;
        owlRememberStaff(person);
        await presentOwlLocal({
            handled:true,
            html:owlStaffAnswer(person, person.name),
            options:owlStaffOptions(person),
            intent:'staff-contact'
        }, person.name);
        return true;
    }

    if (rule.action === 'program') {
        const program = globalPrograms.find(p => String(p.id || '') === String(rule.value || ''));
        if (!program) return false;
        owlRememberProgram(program);
        addBotMsg(
            '<b>' + escapeOwlText(program[currentLang === 'ru' ? 'title_ru' : 'title_en'] || '') + '</b>' +
            '<br><span class="owl-guided-hint">Я вспомнил, что раньше похожая формулировка привела вас к этой программе.</span>'
        );
        setOptions(owlProgramActionOptions(program));
        return true;
    }

    if (rule.action === 'filter') {
        owlFilterCandidatePrograms(rule.value);
        return true;
    }

    return false;
}

let owlLastSubmit = { text:'', at:0 };

async function handleUserMessage() {
    const input = document.getElementById('chatUserInput');
    if (owlAiRequestInFlight) return;
    const originalText = input.value.trim();
    if (!originalText) return;

    const now = Date.now();
    if (owlLastSubmit.text === originalText && now - owlLastSubmit.at < 1200) {
        input.value = '';
        return;
    }
    owlLastSubmit = { text:originalText, at:now };

    addUserMsg(originalText);
    input.value = '';

    // Обычный режим зависит от локального каталога. Если пользователь успел
    // спросить раньше окончания фоновой загрузки, дожидаемся/повторяем её,
    // вместо того чтобы оборвать обработчик без ответа.
    if (!Array.isArray(globalPrograms) || !globalPrograms.length) {
        try {
            if (typeof fetchPrograms === 'function') await fetchPrograms();
        } catch (catalogLoadError) {
            console.warn('Owl catalog readiness fallback:', catalogLoadError);
        }
    }

    if (!Array.isArray(globalPrograms) || !globalPrograms.length) {
        addBotMsg(
            currentLang === 'ru'
                ? 'Каталог программ сейчас не успел загрузиться. Попробуйте повторить вопрос через несколько секунд — я не буду подбирать случайный вариант.'
                : 'The program catalog has not finished loading yet. Please repeat the question in a few seconds.'
        );
        setOptions(owlGuidedFallbackOptions());
        return;
    }

    let text = originalText;

    // Критичные FAQ сайта обрабатываем раньше обучаемых правил.
    // Иначе старое ошибочно выученное соответствие вроде
    // "какие документы нужны?" -> программа про документооборот
    // перехватывает вопрос и ломает даже расширенный режим.
    const faqResolution = owlResolveSiteFaq(originalText);
    if (faqResolution && faqResolution.handled) {
        owlConversationState.lastProgramId = null;
        owlConversationState.lastCandidateIds = [];
        owlConversationState.negativeCount = 0;
        owlConversationState.advancedNegativeCount = 0;
        saveOwlConversationState();
        await presentOwlLocal(faqResolution, originalText);
        return;
    }

    if (window.OwlLearning) {
        try {
            const protectedGeneralQuery =
                /(документ[а-я-]*|паспорт[а-я-]*|снилс|поступлен[а-я-]*|зачислен[а-я-]*|диплом[а-я-]*|удостоверен[а-я-]*|сертификат[а-я-]*|фрдо)/i
                    .test(normalizeText(String(originalText || '').replace(/ё/g, 'е')));

            const normalizedOriginal = owlSmartNormalize(originalText);
            // Не используем \\b/\\w для русских слов: в JavaScript они ASCII-ориентированы
            // и не считают кириллицу "словом". Из-за этого "покажи программу..."
            // ошибочно пропускалось в обученную память.
            const explicitProgramRequest =
                owlIntent('programs', originalText) ||
                /(?:^|\s)(?:программ[а-я-]*|курс[а-я-]*|обучен[а-я-]*|переподготов[а-я-]*|квалификац[а-я-]*|подбери[а-я-]*|подобрать[а-я-]*|посоветуй[а-я-]*|порекомендуй[а-я-]*)/i.test(normalizedOriginal) ||
                /что.*(?:посмотреть|подобрать|выбрать)/i.test(normalizedOriginal);
            const explicitStaffRequest =
                owlStaffContextRequested(originalText) ||
                /(?:^|\s)(?:сотрудник[а-я-]*|преподавател[а-я-]*|директор[а-я-]*|заместител[а-я-]*|руководител[а-я-]*|специалист[а-я-]*|методист[а-я-]*|контакт[а-я-]*|телефон[а-я-]*|номер[а-я-]*|почт[а-я-]*|email|кабинет[а-я-]*)/i.test(normalizedOriginal) ||
                /(?:кто такая|кто такой|как связат|кому написат|кому позвон)/i.test(normalizedOriginal);

            // Явный поиск программы сначала обязан пройти по актуальному каталогу.
            // Обученная память используется только для неоднозначных формулировок и
            // не может закрепить широкий тематический запрос за одной старой карточкой.
            const learnedRule = (protectedGeneralQuery || explicitProgramRequest)
                ? null
                : window.OwlLearning.lookup(originalText);
            if (learnedRule) {
                // Обучение не имеет права менять тип намерения пользователя.
                // Старое ошибочное правило "запрос программы -> сотрудник" игнорируем.
                const conflictsWithIntent =
                    (explicitProgramRequest && learnedRule.action === 'staff' && !explicitStaffRequest) ||
                    (explicitStaffRequest && learnedRule.action === 'program' && !explicitProgramRequest);

                if (!conflictsWithIntent) {
                    if (learnedRule.action === 'preset' && learnedRule.value) {
                        text = learnedRule.value;
                    } else if (await owlApplyLearnedRule(learnedRule, originalText)) {
                        return;
                    }
                }
            }
        } catch (e) {}
    }

    // --- СЛУЖЕБНЫЕ РЕЖИМЫ ---
const staffCommand = normalizeText(text);

const wantsAdminChooser = [
'служебный вход',
'режим администратора',
'режим админа',
'админ режим'
].some(cmd => staffCommand === cmd || staffCommand.includes(cmd));

const wantsNewsEditor = [
'режим редактора',
'редактор',
'добавить новость',
'создать новость',
'опубликовать новость',
'новая новость',
'редакция'
].some(cmd => staffCommand.includes(cmd));

const wantsStaffPortal = [
'служебный портал',
'загрузить учебный план',
'загрузка учебного плана'
].some(cmd => staffCommand.includes(cmd));

if (wantsAdminChooser) {
setTimeout(() => {
    addBotMsg(
        currentLang === 'ru'
            ? '🔐 <b>Служебный режим</b><br><br>Выберите уровень доступа. <b>Pro режим</b> предназначен для полного управления сайтом и требует отдельного пароля. <b>Загрузка учебных планов</b> откроется в новой вкладке и запросит свой PIN-код.'
            : '🔐 <b>Staff mode</b><br><br>Choose an access level. <b>Pro mode</b> is for full site management and requires its own password. <b>Curriculum upload</b> opens in a new tab and uses its own PIN.'
    );
    setOptions(
        '<button class="chat-opt-btn" onclick="openSiteAdminLogin()" style="background:linear-gradient(135deg,#29345B,#CA0F3E);color:#fff;border:none;text-align:center;">' +
        (currentLang === 'ru' ? '⚙ Pro режим' : '⚙ Pro mode') +
        '</button>' +
        '<button class="chat-opt-btn" onclick="openStudyPlanUpload()" style="background:rgba(56,189,248,.12);border-color:#38bdf8;color:#38bdf8;text-align:center;">' +
        (currentLang === 'ru' ? '📄 Загрузка учебных планов' : '📄 Curriculum upload') +
        '</button>' +
        '<button class="chat-opt-btn" onclick="resetMenu()">' + translationsHTML[currentLang].staffBack + '</button>'
    );
}, 300);
return;
}

if (wantsStaffPortal) {
addBotMsg(
    currentLang === 'ru'
        ? '📄 <b>Загрузка учебных планов</b><br><br>Открываю служебную страницу в новой вкладке. Для входа используйте выданный PIN-код.'
        : '📄 <b>Curriculum upload</b><br><br>Opening the staff page in a new tab. Use the assigned PIN to sign in.'
);
openStudyPlanUpload();
setOptions('<button class="chat-opt-btn" onclick="resetMenu()">' + translationsHTML[currentLang].staffBack + '</button>');
return;
}

if (wantsNewsEditor) {
setTimeout(() => {
    addBotMsg(translationsHTML[currentLang].staffNewsMsg);
    setOptions(
        '<button class="chat-opt-btn" onclick="window.location.href=&quot;news.html?editor=1&quot;" style="background:linear-gradient(135deg,#29345B,#CA0F3E);color:#fff;border:none;text-align:center;">' +
        translationsHTML[currentLang].staffContinue +
        '</button>' +
        '<button class="chat-opt-btn" onclick="resetMenu()">' + translationsHTML[currentLang].staffBack + '</button>'
    );
}, 300);
return;
}
// --- КОНЕЦ СЛУЖЕБНЫХ РЕЖИМОВ ---

    if (await handleOwlNegativeFeedback(originalText)) {
        return;
    }

    const cleanCode = String(text || '').trim().toUpperCase();
    let foundFile = globalOwlFiles.find(f => String(f.code || '').toUpperCase() === cleanCode);

    // Если кода ещё нет в локальном списке, один раз тихо перепроверяем
    // свежий статический снимок, прежде чем считать код неизвестным.
    if (!foundFile) {
        await refreshOwlFilesSnapshot({ silent: true });
        foundFile = globalOwlFiles.find(f => String(f.code || '').toUpperCase() === cleanCode);
    }

    if (foundFile && !siteKeyIsVisible(owlVisibilityKey(foundFile))) {
        foundFile = Object.assign({}, foundFile, { isPublished:false });
    }

    if (foundFile) {
        if (currentLang === 'en') {
            await loadOwlI18n();
        }

        const localizedTitle = escapeOwlText(localizedOwlField(foundFile, 'title'));
        const localizedComment = localizedOwlField(foundFile, 'comment');

        setTimeout(() => {
            if (foundFile.isPublished) {
                const safeFileUrl = safeOwlHttpUrl(foundFile.url);
                let responseMsg =
                    formatI18n(translationsHTML[currentLang].owlMaterialsFound, { title: localizedTitle });
                if (safeFileUrl) {
                    responseMsg +=
                        `<br><br><a href="${escapeOwlText(safeFileUrl)}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; font-weight: 800; text-decoration: underline;">${translationsHTML[currentLang].owlMaterialsOpen}</a>`;
                }
                if (localizedComment) {
                    responseMsg += `<br><br>${translationsHTML[currentLang].owlTeacherComment}<br><i style="color: #cbd5e1; display: inline-block; margin-top: 5px;">${escapeOwlText(localizedComment).replace(/\n/g, '<br>')}</i>`;
                }
                responseMsg += `<br><br><span style="font-size: 0.8rem; color: var(--text-muted);">${translationsHTML[currentLang].owlMaterialsUpdated} ${foundFile.date}</span>`;
                addBotMsg(responseMsg);
            } else {
                addBotMsg(
                    formatI18n(translationsHTML[currentLang].owlMaterialHidden, { title: localizedTitle }) +
                    `<br><br><span style="font-size: 0.8rem; color: var(--text-muted);">${translationsHTML[currentLang].owlStatusChanged} ${foundFile.date}</span>`
                );
            }
        }, 500);
        return;
    }

    const hasFactQuestion = owlRequestedFacets(text).length > 0;

    // Контекстные вопросы не запускают новый вероятностный поиск.
    const refersToCurrentProgram = /\b(эта|этой|эту|этот|этого|этому)\s+(программ|курс)\w*|\b(по ней|о ней|про нее|про неё)\b/i.test(owlSmartNormalize(text));
    if (hasFactQuestion && refersToCurrentProgram) {
        const currentProgram = owlLastProgramContext();
        if (!currentProgram) {
            addBotMsg('Уточните, пожалуйста, название программы. Я не хочу угадывать и показывать неверный вариант.');
            setOptions(owlGuidedFallbackOptions());
            return;
        }
        const contextAnswer = owlProgramFactResponse(currentProgram, owlRequestedFacets(text), text);
        if (contextAnswer && contextAnswer.handled) {
            await presentOwlLocal(contextAnswer, text);
            return;
        }
    }
    const hardProgramDiscovery = owlIsProgramDiscoveryRequest(text);
    const hardStaffRequest = owlIsExplicitStaffRequest(text);
    if (hardProgramDiscovery && !hardStaffRequest) {
        owlConversationState.lastStaffKey = null;
        saveOwlConversationState();
    }
    const hasStaffMatch = !hardProgramDiscovery && owlFindStaffMatches(text).length > 0;
    const isProgramDiscovery =
        hardProgramDiscovery ||
        /(^|\s)(что есть|что у вас есть|покажи|найди|подбери|варианты)(\s|$)/i.test(owlSmartNormalize(text));

    const topicResolution = (!hasFactQuestion && !hasStaffMatch && isProgramDiscovery)
        ? owlTopicProgramResult(text)
        : null;

    if (topicResolution && topicResolution.handled) {
        await presentOwlLocal(topicResolution, text);
        return;
    }

    const localResolution = resolveOwlLocally(text);
    if (localResolution && localResolution.handled) {
        await presentOwlLocal(localResolution, text);
        return;
    }

    const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
    const explicitlyNamed = findProgramsExplicitlyNamed(text);

    if (explicitlyNamed.length === 1) {
        showProgramDetails(explicitlyNamed[0]);
        return;
    }

    if (explicitlyNamed.length > 1) {
        const sameTitle = explicitlyNamed.every(
            item => normalizeText(item[titleKey]) === normalizeText(explicitlyNamed[0][titleKey])
        );

        if (sameTitle) {
            addBotMsg(
                currentLang === 'ru'
                    ? 'В каталоге есть несколько вариантов этой программы. У них отличаются стоимость и сроки. Выберите нужный вариант:'
                    : 'There are several variants of this program with different tuition and dates. Choose the relevant one:'
            );

            let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
            explicitlyNamed.forEach(program => {
                html += owlProgramLink(
                    program,
                    program.tab === 'tab-kadry'
                        ? (currentLang === 'ru' ? 'Открыть вариант «Кадры» →' : 'Open Kadry variant →')
                        : (currentLang === 'ru' ? 'Открыть программу →' : 'Open program →')
                );
            });
            html += '</div>';
            setOptions(html);
            return;
        }
    }

    const scored = globalPrograms
        .map(p => ({ p, score: owlProgramProbability(text, p) }))
        .filter(x => x.score >= 0.34)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

    setTimeout(() => {
        const lead = scored[0] || null;
        const runnerUp = scored[1] || null;
        const confidentLead = !!lead && lead.score >= 0.72 && (!runnerUp || lead.score - runnerUp.score >= 0.16);
        if (confidentLead) {
            showProgramDetails(lead.p);
        } else if (scored.length > 0) {
            addBotMsg('Похоже, я не нашёл именно то, что вы искали. Попробуйте сформулировать вопрос немного иначе: укажите тему, профессию, длительность или название программы.<div class="owl-guided-hint">Я не буду показывать случайные программы, если не уверен в совпадении.</div>');
            setOptions(owlGuidedFallbackOptions());
        } else {
            if (owlConversationState.mode === 'advanced' && owlConversationState.advancedUnlocked) {
                askOwlAI(text);
            } else {
                if (window.OwlLearning) {
                    try {
                        window.OwlLearning.rememberUnknown(originalText, {
                            mode: owlConversationState.mode,
                            intent: owlConversationState.lastIntent || '',
                            page: location.pathname || '/'
                        });
                    } catch (e) {}
                }
                addBotMsg(
                    'Похоже, я пока не понял, что именно вам нужно.' +
                    '<div class="owl-guided-hint">Можно выбрать подходящий вариант ниже или написать вопрос ещё проще.</div>'
                );
                setOptions(owlGuidedFallbackOptions());
            }
        }
    }, 450);
}

function showProgramDetailsById(id) {
    const p = globalPrograms.find(x => x.id === id);
    if (p) showProgramDetails(p);
}

function showProgramDetails(p) {
    owlRememberProgram(p);
    const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
    const descKey = currentLang === 'ru' ? 'desc_ru' : 'desc_en';
    const bulletsKey = currentLang === 'ru' ? 'bullets_ru' : 'bullets_en';
    addUserMsg(p[titleKey]);
    const localizedPrice = localizedProgramMeta(p, 'price', currentLang);
    const localizedHours = localizedProgramMeta(p, 'hours', currentLang);
    let html = `<b>${p[titleKey]}</b><br>${p[descKey] || ''}<br><br>💰 ${localizedPrice} · ⏱ ${localizedHours}`;
    if (p[bulletsKey] && p[bulletsKey].length) {
        html += '<ul style="margin:10px 0 0 18px; padding:0;">';
        p[bulletsKey].forEach(b => { if (b && b.trim()) html += `<li>${b.trim()}</li>`; });
        html += '</ul>';
    }
    html += owlRecommendationBlock(p);
    addBotMsg(html);
    setOptions(owlProgramActionOptions(p));
}

function offerAllPrograms(autoFly) {
    setOptions(`<button class="chat-opt-btn" onclick="goToAllPrograms()">${translationsHTML[currentLang].goAllPrograms}</button>`);
    if (autoFly && !isMobile()) {
        setTimeout(owlFlyToPrograms, 400);
    }
}

function goToAllPrograms() {
    if (isMobile()) {
        document.getElementById('owlChat').classList.remove('active');
        document.getElementById('owlContainer').classList.remove('chat-opened');
    }
    focusTab('tab-all');
}

const botTexts = {
    ru: {
        catPrompt: "Мы реализуем обучение по 5 направлениям каталога. Какое вас интересует?",
        optKadry: "🎓 Нацпроект «Кадры»", optPk: "📈 Повышение квалификации", optPp: "🔄 Переподготовка", optPo: "🛠️ Проф. обучение", optSem: "🗣️ Семинары",
        optBack: "⬅️ Назад в меню",
        optEnroll: "✍️ Инициировать заявку", optOther: "🔄 Анализировать другие направления",
        testStart: "Анализ запущен. Ответьте на 12 вопросов, чтобы алгоритм вычислил оптимальный вектор вашего профессионального развития.",
        resGos: "Вердикт системы: <b>«Госслужба и закупки»</b>. Ваш профиль демонстрирует системное мышление и предрасположенность к высокому уровню ответственности.",
        resBiz: "Вердикт системы: <b>«Цифровой бизнес и ИИ»</b>. Вы ориентированы на стратегическое масштабирование и интеграцию инноваций.",
        resHoreca: "Вердикт системы: <b>«HoReCa и Туризм»</b>. Ваши сильные стороны — коммуникация и обеспечение премиального сервиса.",
        resProf: "Вердикт системы: <b>«Быстрые профессии»</b>. Вы цените применимый на практике результат и стремитесь к быстрой монетизации навыков.",
        resEnroll: "✍️ Зафиксировать заявку на это направление", resCat: "🔄 Отклонить. Показать весь каталог"
    },
    en: {
        catPrompt: "We provide training across all 5 catalog sections. Which one interests you?",
        optKadry: "🎓 National Project «Kadry»", optPk: "📈 Upgrading Qualifications", optPp: "🔄 Retraining", optPo: "🛠️ Vocational Training", optSem: "🗣️ Seminars",
        optBack: "⬅️ Back to main menu",
        optEnroll: "✍️ Initiate application", optOther: "🔄 Analyze other tracks",
        testStart: "Analysis launched. Please answer 12 questions so the algorithm can determine your optimal professional development vector.",
        resGos: "System Verdict: <b>«Public Administration & Procurement»</b>. Your profile demonstrates systematic thinking and a strong predisposition for high-level responsibility.",
        resBiz: "System Verdict: <b>«Digital Business & AI»</b>. You are highly focused on strategic scaling and the integration of cutting-edge innovations.",
        resHoreca: "System Verdict: <b>«HoReCa & Tourism»</b>. Your core strengths lie in effective communication and delivering premium customer service.",
        resProf: "System Verdict: <b>«Fast-Track Professions»</b>. You deeply value practical results and strive for the rapid monetization of your skills.",
        resEnroll: "✍️ Lock in an application for this track", resCat: "🔄 Reject. View the full catalog"
    }
};

const testQuestionsData = {
    ru: [
        { q: "1/12. Какова главная цель инвестиций в ваше образование?", answers: [{t:"Карьера на государственной службе",v:"gos"},{t:"Масштабирование бизнес-показателей",v:"biz"},{t:"Управление сервисом (HoReCa)",v:"horeca"},{t:"Освоение новой прикладной профессии",v:"prof"}] },
        { q: "2/12. С каким типом задач вы предпочитаете работать?", answers: [{t:"Нормативно-правовая документация",v:"gos"},{t:"Стратегии и ИТ-инструментарий",v:"biz"},{t:"Команда и качество услуг",v:"horeca"},{t:"Работа руками или точный учет в 1С",v:"prof"}] },
        { q: "3/12. Ваше отношение к нейросетям?", answers: [{t:"Использую для оптимизации отчетов",v:"gos"},{t:"Критически важно для автоматизации",v:"biz"},{t:"Полезно для маркетинга и туризма",v:"horeca"},{t:"Предпочитаю традиционные подходы",v:"prof"}] },
        { q: "4/12. Каков приемлемый для вас объем образовательной программы?", answers: [{t:"Глубокая переподготовка (>500 часов)",v:"gos"},{t:"Управленческий интенсив (<250 часов)",v:"biz"},{t:"Сбалансированный курс (100-150 часов)",v:"horeca"},{t:"Быстрый старт (<100 часов)",v:"prof"}] },
        { q: "5/12. Какая зона ответственности для вас наиболее комфортна?", answers: [{t:"Ответственность за государственные контракты",v:"gos"},{t:"Ответственность за финансовые потоки",v:"biz"},{t:"Ответственность за репутацию заведения",v:"horeca"},{t:"Точное выполнение прикладной задачи",v:"prof"}] },
        { q: "6/12. Какую сферу вы считаете наиболее стабильной?", answers: [{t:"Органы исполнительной власти",v:"gos"},{t:"Собственное дело / Корпоративный сектор",v:"biz"},{t:"Внутренний туризм",v:"horeca"},{t:"Профессии, требующие работы руками",v:"prof"}] },
        { q: "7/12. Ваш подход к решению нестандартных ситуаций?", answers: [{t:"Опираюсь на действующие законы и регламенты",v:"gos"},{t:"Ищу инновационные технологичные решения",v:"biz"},{t:"Выстраиваю диалог и устраняю конфликт",v:"horeca"},{t:"Действую по проверенным инструкциям",v:"prof"}] },
        { q: "8/12. Ваш карьерный горизонт через 3 года?", answers: [{t:"Руководитель государственного ведомства",v:"gos"},{t:"Топ-менеджер / Успешный предприниматель",v:"biz"},{t:"Управляющий премиальным отелем",v:"horeca"},{t:"Востребованный профильный специалист",v:"prof"}] },
        { q: "9/12. Отношение к государственным стандартам (ФГОС, ГОСТ)?", answers: [{t:"Неукоснительное соблюдение",v:"gos"},{t:"Адаптация под бизнес-реалии",v:"biz"},{t:"Соблюдение ради безопасности клиента",v:"horeca"},{t:"Работа строго по заданному стандарту",v:"prof"}] },
        { q: "10/12. Главный KPI вашей успешной работы?", answers: [{t:"Отсутствие санкций от надзорных органов",v:"gos"},{t:"Увеличение доли рынка и маржинальности",v:"biz"},{t:"Высокий показатель возврата гостей",v:"horeca"},{t:"Сдача задачи точно в срок",v:"prof"}] },
        { q: "11/12. Какая дисциплина кажется вам наиболее приоритетной?", answers: [{t:"Правоприменительная практика по ФЗ",v:"gos"},{t:"Промптинг нейросетей",v:"biz"},{t:"Маркетинг впечатлений",v:"horeca"},{t:"Бухгалтерский учет",v:"prof"}] },
        { q: "12/12. Ваш текущий профессиональный статус?", answers: [{t:"Служащий / Специалист по закупкам",v:"gos"},{t:"Предприниматель / Аналитик",v:"biz"},{t:"Работаю в сфере услуг",v:"horeca"},{t:"Нахожусь в поиске новой профессии",v:"prof"}] }
    ],
    en: [
        { q: "1/12. What is the primary goal of investing in your education?", answers: [{t:"A career in public service",v:"gos"},{t:"Scaling business metrics",v:"biz"},{t:"Service management (HoReCa)",v:"horeca"},{t:"Mastering a new applied profession",v:"prof"}] },
        { q: "2/12. What kind of tasks do you prefer working with?", answers: [{t:"Regulatory and legal documentation",v:"gos"},{t:"Strategies and IT tools",v:"biz"},{t:"People and service quality",v:"horeca"},{t:"Manual work or precise 1C accounting",v:"prof"}] },
        { q: "3/12. What is your attitude towards AI?", answers: [{t:"I use it to optimize reports",v:"gos"},{t:"Critically important for automation",v:"biz"},{t:"Useful for marketing and tourism",v:"horeca"},{t:"I prefer traditional approaches",v:"prof"}] },
        { q: "4/12. What is an acceptable program duration for you?", answers: [{t:"Deep retraining (>500 hours)",v:"gos"},{t:"Management intensive (<250 hours)",v:"biz"},{t:"Balanced course (100-150 hours)",v:"horeca"},{t:"Fast start (<100 hours)",v:"prof"}] },
        { q: "5/12. Which area of responsibility are you most comfortable with?", answers: [{t:"Responsibility for state contracts",v:"gos"},{t:"Responsibility for financial flows",v:"biz"},{t:"Responsibility for reputation",v:"horeca"},{t:"Precise execution of an applied task",v:"prof"}] },
        { q: "6/12. Which sector do you consider the most stable?", answers: [{t:"Executive authorities",v:"gos"},{t:"Own business / Corporate sector",v:"biz"},{t:"Domestic tourism",v:"horeca"},{t:"Professions requiring manual work",v:"prof"}] },
        { q: "7/12. How do you approach solving non-standard situations?", answers: [{t:"I rely on applicable laws and regulations",v:"gos"},{t:"I seek innovative tech solutions",v:"biz"},{t:"I build dialogue and resolve conflicts",v:"horeca"},{t:"I act according to proven instructions",v:"prof"}] },
        { q: "8/12. What is your career horizon in 3 years?", answers: [{t:"Head of a state department",v:"gos"},{t:"Top executive / Entrepreneur",v:"biz"},{t:"Manager of a premium hotel",v:"horeca"},{t:"In-demand specialized professional",v:"prof"}] },
        { q: "9/12. What is your attitude towards state standards?", answers: [{t:"Strict compliance",v:"gos"},{t:"Adaptation to business realities",v:"biz"},{t:"Compliance for client safety",v:"horeca"},{t:"Working strictly by the standard",v:"prof"}] },
        { q: "10/12. What is the main KPI of your successful work?", answers: [{t:"No sanctions from supervisory bodies",v:"gos"},{t:"Increased market share and margins",v:"biz"},{t:"High rate of guest returns",v:"horeca"},{t:"Task completion exactly on time",v:"prof"}] },
        { q: "11/12. What is the highest priority discipline to you?", answers: [{t:"Law enforcement practice",v:"gos"},{t:"Neural network prompting",v:"biz"},{t:"Experience marketing",v:"horeca"},{t:"Accounting",v:"prof"}] },
        { q: "12/12. What is your current professional status?", answers: [{t:"Civil servant / Procurement specialist",v:"gos"},{t:"Entrepreneur / Analyst",v:"biz"},{t:"Working in services",v:"horeca"},{t:"Looking for a new profession",v:"prof"}] }
    ]
};

const chatBody = document.getElementById('chatBody');
const chatOptions = document.getElementById('chatOptions');

function addUserMsg(text) {
    const node = document.createElement('div');
    node.className = 'msg-user';
    node.textContent = String(text || '');
    chatBody.appendChild(node);
    scrollToBottom();
}
function addBotMsg(text) {
    const botName = currentLang === 'ru' ? 'Сова:' : 'Owl:';
    chatBody.innerHTML += `<div class="msg-bot"><b>${botName}</b> ${text}</div>`;
    scrollToBottom();
}

function showOwlThinking() {
    removeOwlThinking();
    const botName = currentLang === 'ru' ? 'Сова:' : 'Owl:';
    const label = currentLang === 'ru' ? 'думает' : 'is thinking';

    const msg = document.createElement('div');
    msg.className = 'msg-bot';
    msg.id = 'owlThinkingMsg';

    const name = document.createElement('b');
    name.textContent = botName + ' ';

    const thinking = document.createElement('span');
    thinking.className = 'msg-bot-thinking';

    const labelNode = document.createElement('span');
    labelNode.textContent = label;

    const dots = document.createElement('span');
    dots.className = 'owl-thinking-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));

    thinking.append(labelNode, dots);
    msg.append(name, thinking);
    chatBody.appendChild(msg);
    scrollToBottom();
}

function removeOwlThinking() {
    const thinking = document.getElementById('owlThinkingMsg');
    if (thinking) thinking.remove();
}
function scrollToBottom() { setTimeout(() => { chatBody.scrollTop = chatBody.scrollHeight; }, 100); }
function setOptions(html) {
    chatOptions.innerHTML = html;
    if (typeof applySiteVisibility === 'function') {
        requestAnimationFrame(() => applySiteVisibility());
    }
}

const OWL_STATE_KEY = 'ranepa_owl_conversation_v1';
let owlConversationState = {
    unresolvedStreak: 0,
    lastProgramId: null,
    lastIntent: null,
    negativeCount: 0,
    advancedNegativeCount: 0,
    advancedUnlocked: false,
    mode: 'normal',
    lastCandidateIds: [],
    lastStaffKey: null
};

function loadOwlConversationState() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(OWL_STATE_KEY) || '{}');
        if (saved && typeof saved === 'object') {
            owlConversationState = Object.assign(owlConversationState, saved);
        }
    } catch (e) {}
}

function saveOwlConversationState() {
    try {
        sessionStorage.setItem(OWL_STATE_KEY, JSON.stringify(owlConversationState));
    } catch (e) {}
}

function owlBrainConfig() {
    return window.OWL_BRAIN || { intents:{}, replies:{}, contacts:{}, escalation:{} };
}

function owlSmartNormalize(value) {
    let text = normalizeText(String(value || '').replace(/ё/g, 'е'));
    const replacements = owlBrainConfig().replacements || {};
    Object.keys(replacements).forEach(from => {
        const normalizedFrom = normalizeText(from.replace(/ё/g, 'е'));
        const normalizedTo = normalizeText(String(replacements[from] || '').replace(/ё/g, 'е'));
        if (normalizedFrom) text = (' ' + text + ' ').split(' ' + normalizedFrom + ' ').join(' ' + normalizedTo + ' ').trim();
    });

    if (window.OwlLearning && typeof window.OwlLearning.correctText === 'function') {
        const extras = [];
        try {
            document.querySelectorAll('#contactsSection .contact-card h4, #contactsSection .contact-card .position')
                .forEach(node => extras.push(node.textContent || ''));
            if (Array.isArray(globalPrograms)) {
                globalPrograms.slice(0, 120).forEach(program => extras.push(program.title_ru || ''));
            }
            text = window.OwlLearning.correctText(text, extras);
        } catch (e) {}
    }

    return text.replace(/\s+/g, ' ').trim();
}

function owlIntent(name, query) {
    const list = (owlBrainConfig().intents || {})[name] || [];
    const normalized = owlSmartNormalize(query);
    if (!normalized) return false;

    const padded = ' ' + normalized + ' ';
    return list.some(rawPhrase => {
        const phrase = owlSmartNormalize(rawPhrase);
        if (!phrase) return false;

        // Однословные короткие интенты ("ок", "да", "нет") должны
        // совпадать только как самостоятельное слово, иначе "ок"
        // срабатывает внутри "документы".
        if (!phrase.includes(' ')) {
            return normalized === phrase || padded.includes(' ' + phrase + ' ');
        }

        return normalized === phrase || padded.includes(' ' + phrase + ' ');
    });
}

const OWL_REPLY_HISTORY_KEY = 'ranepa_owl_reply_history_v1';
let owlReplyHistory = {};
try { owlReplyHistory = JSON.parse(sessionStorage.getItem(OWL_REPLY_HISTORY_KEY) || '{}') || {}; } catch (e) {}

function owlPickReply(value, poolName) {
    if (!Array.isArray(value)) return String(value || '');
    if (!value.length) return '';

    const key = String(poolName || 'default');
    const used = Array.isArray(owlReplyHistory[key]) ? owlReplyHistory[key] : [];
    let available = value.filter(item => !used.includes(item));

    if (!available.length) {
        owlReplyHistory[key] = [];
        available = value.slice();
    }

    const pick = available[Math.floor(Math.random() * available.length)];
    const nextUsed = (owlReplyHistory[key] || []).concat([pick]).slice(-Math.min(value.length, 24));
    owlReplyHistory[key] = nextUsed;

    try { sessionStorage.setItem(OWL_REPLY_HISTORY_KEY, JSON.stringify(owlReplyHistory)); } catch (e) {}
    return pick;
}

function updateOwlModeUI() {
    const state = owlConversationState;
    const switcher = document.getElementById('owlModeSwitch');
    const badge = document.getElementById('owlModeBadge');
    const normalBtn = document.getElementById('owlModeNormalBtn');
    const advancedBtn = document.getElementById('owlModeAdvancedBtn');

    if (switcher) switcher.hidden = false;
    if (badge) {
        const advanced = state.mode === 'advanced';
        badge.textContent = advanced ? 'Расширенный' : 'Обычный';
        badge.classList.toggle('advanced', advanced);
    }
    if (normalBtn) normalBtn.classList.toggle('active', state.mode !== 'advanced');
    if (advancedBtn) {
        advancedBtn.classList.toggle('active', state.mode === 'advanced');
        advancedBtn.classList.toggle('advanced', state.mode === 'advanced');
    }
}

function setOwlMode(mode, announce) {
    const target = mode === 'advanced' ? 'advanced' : 'normal';
    if (target === 'advanced') owlConversationState.advancedUnlocked = true;

    owlConversationState.mode = target;
    if (target === 'advanced') {
        owlConversationState.advancedNegativeCount = 0;
    }
    saveOwlConversationState();
    updateOwlModeUI();
    hideOwlAdvancedOffer();

    if (announce) {
        if (target === 'advanced') {
            addBotMsg('Расширенный режим включён. Теперь я буду глубже разбирать формулировку и контекст вашего вопроса.');
        } else {
            addBotMsg('Вернулись в обычный режим. Продолжим с короткими подсказками и вариантами выбора.');
        }
    }
}

const OWL_WINDOW_STATE_KEY = 'ranepa_owl_window_v2';
let owlWindowDrag = null;
let owlResizeDrag = null;
let owlSplitBeforeRect = null;

function owlClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function saveOwlWindowRect() {
    const chat = document.getElementById('owlChat');
    if (!chat || !chat.classList.contains('owl-chat-free') || chat.classList.contains('owl-chat-split')) return;
    const rect = chat.getBoundingClientRect();
    try {
        localStorage.setItem(OWL_WINDOW_STATE_KEY, JSON.stringify({
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        }));
    } catch (e) {}
}

function readOwlWindowRect() {
    try {
        const value = JSON.parse(localStorage.getItem(OWL_WINDOW_STATE_KEY) || 'null');
        return value && typeof value === 'object' ? value : null;
    } catch (e) {
        return null;
    }
}

function applyOwlFreeRect(rect) {
    const chat = document.getElementById('owlChat');
    if (!chat) return;

    const gap = 12;
    const minW = 340;
    const minH = 420;
    const maxW = Math.max(minW, window.innerWidth - gap * 2);
    const maxH = Math.max(minH, window.innerHeight - gap * 2);

    const width = owlClamp(Number(rect && rect.width) || Math.min(760, window.innerWidth * .62), minW, maxW);
    const height = owlClamp(Number(rect && rect.height) || Math.min(760, window.innerHeight * .78), minH, maxH);
    const left = owlClamp(Number(rect && rect.left) || (window.innerWidth - width) / 2, gap, Math.max(gap, window.innerWidth - width - gap));
    const top = owlClamp(Number(rect && rect.top) || (window.innerHeight - height) / 2, gap, Math.max(gap, window.innerHeight - height - gap));

    chat.style.left = Math.round(left) + 'px';
    chat.style.top = Math.round(top) + 'px';
    chat.style.width = Math.round(width) + 'px';
    chat.style.height = Math.round(height) + 'px';
    chat.style.right = 'auto';
    chat.style.bottom = 'auto';
}

function clearOwlWindowInlineRect() {
    const chat = document.getElementById('owlChat');
    if (!chat) return;
    ['left','top','width','height','right','bottom'].forEach(prop => chat.style.removeProperty(prop));
}

function updateOwlWindowButtons() {
    const chat = document.getElementById('owlChat');
    const expand = document.getElementById('owlFullscreenBtn');
    const split = document.getElementById('owlSplitBtn');
    if (!chat) return;

    const isFree = chat.classList.contains('owl-chat-free');
    const isSplit = chat.classList.contains('owl-chat-split');

    if (expand) {
        expand.textContent = isFree && !isSplit ? '↙' : '⛶';
        expand.title = isFree && !isSplit ? 'Вернуть компактный размер' : 'Свободное изменяемое окно';
        expand.setAttribute('aria-label', expand.title);
    }
    if (split) {
        split.classList.toggle('active', isSplit);
        split.title = isSplit ? 'Выйти из двойного экрана' : 'Сайт слева, чат справа';
        split.setAttribute('aria-label', split.title);
    }
}

function exitOwlSplitView(options) {
    const opts = options || {};
    const chat = document.getElementById('owlChat');
    if (!chat) return;

    document.body.classList.remove('owl-chat-split-open');
    chat.classList.remove('owl-chat-split');
    document.body.style.removeProperty('--owl-split-width');

    if (!opts.toCompact) {
        chat.classList.add('owl-chat-free');
        applyOwlFreeRect(owlSplitBeforeRect || readOwlWindowRect());
    } else {
        chat.classList.remove('owl-chat-free');
        clearOwlWindowInlineRect();
    }

    owlSplitBeforeRect = null;
    updateOwlWindowButtons();
}

function toggleOwlSplitView() {
    if (window.innerWidth <= 900) {
        toggleOwlFullscreen();
        return;
    }

    const chat = document.getElementById('owlChat');
    if (!chat) return;

    if (chat.classList.contains('owl-chat-split')) {
        exitOwlSplitView();
        return;
    }

    const rect = chat.getBoundingClientRect();
    owlSplitBeforeRect = {
        left:rect.left, top:rect.top, width:rect.width, height:rect.height
    };

    chat.classList.remove('owl-chat-free');
    clearOwlWindowInlineRect();

    const savedSplit = Number(localStorage.getItem('ranepa_owl_split_width_v1') || 0);
    const width = owlClamp(savedSplit || Math.round(window.innerWidth * .42), 380, Math.min(760, Math.round(window.innerWidth * .68)));
    document.body.style.setProperty('--owl-split-width', width + 'px');
    document.body.classList.add('owl-chat-split-open');
    chat.classList.add('owl-chat-split');
    updateOwlWindowButtons();
    scrollToBottom();
}

function toggleOwlFullscreen() {
    const chat = document.getElementById('owlChat');
    if (!chat) return;

    if (chat.classList.contains('owl-chat-split')) {
        exitOwlSplitView();
    }

    if (chat.classList.contains('owl-chat-free')) {
        saveOwlWindowRect();
        chat.classList.remove('owl-chat-free');
        clearOwlWindowInlineRect();
    } else {
        chat.classList.add('owl-chat-free');
        applyOwlFreeRect(readOwlWindowRect());
    }

    updateOwlWindowButtons();
    scrollToBottom();
}

function beginOwlHeaderDrag(event) {
    const chat = document.getElementById('owlChat');
    if (!chat || window.innerWidth <= 900) return;
    if (!chat.classList.contains('owl-chat-free') || chat.classList.contains('owl-chat-split')) return;
    if (event.target.closest('button, input, a')) return;

    const rect = chat.getBoundingClientRect();
    owlWindowDrag = {
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        left:rect.left,
        top:rect.top,
        width:rect.width,
        height:rect.height
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
}

function beginOwlResize(event) {
    const chat = document.getElementById('owlChat');
    if (!chat || window.innerWidth <= 900) return;
    const dir = String(event.currentTarget.dataset.dir || '');
    if (!dir) return;

    const rect = chat.getBoundingClientRect();

    if (chat.classList.contains('owl-chat-split')) {
        if (dir !== 'w') return;
        owlResizeDrag = {
            split:true,
            pointerId:event.pointerId
        };
    } else {
        if (!chat.classList.contains('owl-chat-free')) {
            chat.classList.add('owl-chat-free');
            applyOwlFreeRect({left:rect.left,top:rect.top,width:rect.width,height:Math.max(rect.height,460)});
        }
        const current = chat.getBoundingClientRect();
        owlResizeDrag = {
            split:false,
            dir,
            pointerId:event.pointerId,
            startX:event.clientX,
            startY:event.clientY,
            left:current.left,
            top:current.top,
            width:current.width,
            height:current.height
        };
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    updateOwlWindowButtons();
}

function moveOwlWindowPointer(event) {
    const chat = document.getElementById('owlChat');
    if (!chat) return;

    if (owlWindowDrag) {
        const gap = 8;
        const dx = event.clientX - owlWindowDrag.startX;
        const dy = event.clientY - owlWindowDrag.startY;
        const left = owlClamp(owlWindowDrag.left + dx, gap, window.innerWidth - owlWindowDrag.width - gap);
        const top = owlClamp(owlWindowDrag.top + dy, gap, window.innerHeight - owlWindowDrag.height - gap);
        chat.style.left = Math.round(left) + 'px';
        chat.style.top = Math.round(top) + 'px';
        return;
    }

    if (!owlResizeDrag) return;

    if (owlResizeDrag.split) {
        const width = owlClamp(window.innerWidth - event.clientX, 380, Math.min(760, Math.round(window.innerWidth * .68)));
        document.body.style.setProperty('--owl-split-width', Math.round(width) + 'px');
        return;
    }

    const d = owlResizeDrag;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    const minW = 340;
    const minH = 420;
    const gap = 8;

    let left = d.left;
    let top = d.top;
    let width = d.width;
    let height = d.height;

    if (d.dir.includes('e')) width = d.width + dx;
    if (d.dir.includes('s')) height = d.height + dy;
    if (d.dir.includes('w')) {
        width = d.width - dx;
        left = d.left + dx;
    }
    if (d.dir.includes('n')) {
        height = d.height - dy;
        top = d.top + dy;
    }

    width = owlClamp(width, minW, window.innerWidth - gap * 2);
    height = owlClamp(height, minH, window.innerHeight - gap * 2);

    if (d.dir.includes('w')) {
        left = owlClamp(left, gap, d.left + d.width - minW);
        if (left + width > window.innerWidth - gap) width = window.innerWidth - gap - left;
    } else {
        width = Math.min(width, window.innerWidth - gap - left);
    }

    if (d.dir.includes('n')) {
        top = owlClamp(top, gap, d.top + d.height - minH);
        if (top + height > window.innerHeight - gap) height = window.innerHeight - gap - top;
    } else {
        height = Math.min(height, window.innerHeight - gap - top);
    }

    chat.style.left = Math.round(left) + 'px';
    chat.style.top = Math.round(top) + 'px';
    chat.style.width = Math.round(width) + 'px';
    chat.style.height = Math.round(height) + 'px';
}

function endOwlWindowPointer() {
    if (owlResizeDrag && owlResizeDrag.split) {
        const value = parseInt(getComputedStyle(document.body).getPropertyValue('--owl-split-width'), 10);
        if (Number.isFinite(value)) {
            try { localStorage.setItem('ranepa_owl_split_width_v1', String(value)); } catch (e) {}
        }
    } else if (owlResizeDrag || owlWindowDrag) {
        saveOwlWindowRect();
    }

    owlWindowDrag = null;
    owlResizeDrag = null;
}

function initOwlWindowControls() {
    const chat = document.getElementById('owlChat');
    if (!chat) return;

    const header = chat.querySelector('.owl-chat-header');
    if (header) header.addEventListener('pointerdown', beginOwlHeaderDrag);

    chat.querySelectorAll('.owl-resize-handle').forEach(handle => {
        handle.addEventListener('pointerdown', beginOwlResize);
    });

    window.addEventListener('pointermove', moveOwlWindowPointer);
    window.addEventListener('pointerup', endOwlWindowPointer);
    window.addEventListener('pointercancel', endOwlWindowPointer);

    window.addEventListener('resize', () => {
        if (chat.classList.contains('owl-chat-split')) {
            const current = parseInt(getComputedStyle(document.body).getPropertyValue('--owl-split-width'), 10) || Math.round(window.innerWidth * .42);
            const width = owlClamp(current, 380, Math.min(760, Math.round(window.innerWidth * .68)));
            document.body.style.setProperty('--owl-split-width', width + 'px');
        } else if (chat.classList.contains('owl-chat-free')) {
            applyOwlFreeRect(chat.getBoundingClientRect());
        }
    });

    updateOwlWindowButtons();
}


function hideOwlAdvancedOffer() {
    const modal = document.getElementById('owlAdvancedOffer');
    if (modal) modal.hidden = true;
}

function showOwlAdvancedOffer() {
    owlConversationState.advancedUnlocked = true;
    saveOwlConversationState();
    updateOwlModeUI();

    const modal = document.getElementById('owlAdvancedOffer');
    const text = document.getElementById('owlAdvancedOfferText');
    const pool = owlBrainConfig().advancedOfferReplies || [];
    if (text) {
        text.textContent = owlPickReply(pool, 'advancedOffer') ||
            'Обычный режим уже несколько раз не попал в ваш запрос. Можно включить расширенный анализ.';
    }
    if (modal) modal.hidden = false;
}

function acceptOwlAdvancedMode() {
    owlConversationState.advancedUnlocked = true;
    owlConversationState.negativeCount = 0;
    saveOwlConversationState();
    setOwlMode('advanced', false);
    addBotMsg('✦ Расширенный режим включён. Можете повторить вопрос своими словами — я попробую разобрать его глубже с учётом контекста разговора.');
}

function declineOwlAdvancedMode() {
    hideOwlAdvancedOffer();
    setOwlMode('normal', false);
    addBotMsg('Остаёмся в обычном режиме. Попробуем разобраться через уточнения и варианты ниже.');
    setOptions(owlGuidedFallbackOptions());
}

function owlIsNegativeFeedback(query) {
    const raw = normalizeText(String(query || '').replace(/ё/g, 'е')).trim();
    if (!raw) return false;

    // Обычный вопрос о программе нельзя принимать за отрицательную реакцию.
    // Это особенно важно для фраз "сколько учиться...", "дорого ли...",
    // "долго учиться..." и похожих естественных формулировок.
    const looksLikeQuestion =
        /^(сколько|какой|какая|какие|когда|где|как|можно|есть|что|чем|кому|для кого)\b/i.test(raw) ||
        /\b(учиться|обучение|курс|программа|срок|цена|стоимость|час|формат|документ|закуп|горнич|бухгалт|туриз|гостин|кадр)\w*/i.test(raw);

    const strongNegative =
        /\b(неправильно|неверно|ошибка|мимо|бред|чушь|ерунда|фигня|тупишь|не понял|не поняла|не понимаешь|не то|не это|не подходит|не работает|не помогло|бесполезно|ответ не тот|это не ответ)\b/i.test(raw);

    if (looksLikeQuestion && !strongNegative) return false;

    const normalized = owlSmartNormalize(raw);
    const words = normalized.split(' ').filter(Boolean);
    const phrases = owlBrainConfig().negativeFeedback || [];

    return phrases.some(rawPhrase => {
        const phrase = owlSmartNormalize(rawPhrase);
        if (!phrase || phrase === 'не') return false;

        if (!phrase.includes(' ') && phrase.length <= 8) {
            return normalized === phrase || words.includes(phrase);
        }

        return normalized === phrase || normalized.includes(phrase);
    });
}

function owlCandidatePrograms() {
    const ids = Array.isArray(owlConversationState.lastCandidateIds)
        ? owlConversationState.lastCandidateIds
        : [];
    return ids
        .map(id => globalPrograms.find(program => String(program.id || '') === String(id)))
        .filter(Boolean);
}

function owlRenderProgramChoices(programs, intro) {
    const items = Array.isArray(programs) ? programs.filter(Boolean) : [];
    if (!items.length) {
        addBotMsg('По этому уточнению подходящих программ не нашёл. Попробуем другим способом.');
        setOptions(owlProgressiveFallbackOptions(Math.max(1, Number(owlConversationState.negativeCount || 1))));
        return;
    }

    owlConversationState.lastCandidateIds = items.map(program => String(program.id));
    saveOwlConversationState();

    addBotMsg(
        (intro || 'Вот варианты после уточнения:') +
        '<div class="owl-guided-hint">Нажмите на название — откроется полное описание программы.</div>'
    );

    setOptions(
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
        owlGroupedTopicLinks(items) +
        '</div>' +
        '<button class="chat-opt-btn" onclick="setOptions(owlProgressiveFallbackOptions(' +
            Math.max(1, Number(owlConversationState.negativeCount || 1)) +
        '))">← К уточнениям</button>'
    );
}

function owlFilterCandidatePrograms(mode) {
    if (window.OwlLearning) {
        try { window.OwlLearning.resolvePending('filter', String(mode || ''), 'filter-button'); } catch (e) {}
    }
    const source = owlCandidatePrograms();
    const pool = source.length ? source : globalPrograms.filter(program => program && program.active !== false);

    let filtered = pool.slice();

    if (mode === 'pk') {
        filtered = pool.filter(program => owlSmartNormalize(program.type || '').includes('повышение квалификации'));
    } else if (mode === 'retraining') {
        filtered = pool.filter(program => owlSmartNormalize(program.type || '').includes('переподготов'));
    } else if (mode === 'professional') {
        filtered = pool.filter(program => owlSmartNormalize(program.type || '').includes('профессиональн'));
    } else if (mode === 'short') {
        filtered = pool
            .map(program => ({ program, hours: owlNumeric(program.hours) }))
            .filter(item => item.hours > 0 && item.hours <= 72)
            .sort((a,b) => a.hours - b.hours)
            .map(item => item.program);
    } else if (mode === 'cheap') {
        const numeric = pool
            .map(program => ({ program, price: owlNumeric(program.price) }))
            .filter(item => item.price > 0)
            .sort((a,b) => a.price - b.price);
        filtered = numeric.length
            ? numeric.slice(0, 6).map(item => item.program)
            : pool.filter(program => /по запросу/i.test(String(program.price || '')));
    } else if (mode === 'online') {
        filtered = pool.filter(program => {
            const format = owlSmartNormalize(program.format || '');
            return format.includes('дот') ||
                format.includes('эо') ||
                format.includes('дистанц') ||
                format.includes('онлайн');
        });
    } else if (mode === 'all') {
        filtered = pool;
    }

    owlRenderProgramChoices(
        filtered.slice(0, 8),
        {
            pk: 'Оставил только программы повышения квалификации.',
            retraining: 'Оставил только программы профессиональной переподготовки.',
            professional: 'Оставил только программы профессионального обучения.',
            short: 'Показываю более короткие программы.',
            cheap: 'Показываю варианты с минимальной указанной стоимостью.',
            online: 'Показываю программы, где в данных указан дистанционный или электронный формат.',
            all: 'Показываю все варианты из последней найденной группы.'
        }[mode] || 'Вот уточнённые варианты:'
    );
}

function owlCandidateKeywordOptions() {
    const programs = owlCandidatePrograms();
    if (!programs.length) return '';

    const counts = new Map();
    programs.forEach(program => {
        owlWords((program.title_ru || '') + ' ' + (program.sector || '')).forEach(word => {
            if (word.length < 5) return;
            if (['повышение','квалификации','профессиональная','программа','управление','вопросы'].includes(word)) return;
            counts.set(word, (counts.get(word) || 0) + 1);
        });
    });

    return [...counts.entries()]
        .sort((a,b) => b[1] - a[1] || b[0].length - a[0].length)
        .slice(0, 4)
        .map(([word]) =>
            '<button class="chat-opt-btn" onclick="owlAskPreset(\'что есть по ' +
            escapeOwlJsString(word) +
            '\')">🔎 ' + escapeOwlText(word.charAt(0).toUpperCase() + word.slice(1)) + '</button>'
        )
        .join('');
}

function owlProgressiveFallbackOptions(step) {
    const n = Math.max(1, Math.min(4, Number(step || 1)));
    const hasCandidates = owlCandidatePrograms().length > 0;
    let html = '';

    if (n === 1) {
        html += '<button class="chat-opt-btn" onclick="owlFilterCandidatePrograms(\'pk\')">🎓 Только повышение квалификации</button>';
        html += '<button class="chat-opt-btn" onclick="owlFilterCandidatePrograms(\'retraining\')">🔄 Только переподготовка</button>';
        html += '<button class="chat-opt-btn" onclick="owlFilterCandidatePrograms(\'professional\')">🛠 Профессиональное обучение</button>';
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'помоги подобрать программу по моей задаче\')">🧭 Подобрать по задаче</button>';
    } else if (n === 2) {
        html += '<button class="chat-opt-btn" onclick="owlFilterCandidatePrograms(\'cheap\')">💰 Подешевле</button>';
        html += '<button class="chat-opt-btn" onclick="owlFilterCandidatePrograms(\'short\')">⚡ Покороче</button>';
        html += '<button class="chat-opt-btn" onclick="owlFilterCandidatePrograms(\'online\')">💻 Дистанционно / онлайн</button>';
        if (hasCandidates) {
            html += '<button class="chat-opt-btn" onclick="owlFilterCandidatePrograms(\'all\')">📚 Все найденные варианты</button>';
        }
    } else if (n === 3) {
        const keywordButtons = owlCandidateKeywordOptions();
        if (keywordButtons) html += keywordButtons;
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'покажи другие направления обучения\')">🧩 Другое направление</button>';
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'какие программы у вас есть\')">📚 Весь каталог по направлениям</button>';
    } else {
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'я опишу задачу своими словами\')">✍️ Описать задачу своими словами</button>';
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'покажи все основные направления обучения\')">🗂 Основные направления</button>';
        if (hasCandidates) {
            html += '<button class="chat-opt-btn" onclick="owlFilterCandidatePrograms(\'all\')">🔁 Вернуться к найденным программам</button>';
        }
        html += '<button class="chat-opt-btn" onclick="showOwlHumanHandoff(\'manual\')">👤 Спросить сотрудника</button>';
    }

    if (n < 4) {
        html += '<button class="chat-opt-btn" onclick="showOwlHumanHandoff(\'manual\')">👤 Связаться с сотрудником</button>';
    }
    html += '<button class="chat-opt-btn" onclick="resetMenu()">← Назад</button>';

    return html;
}

function owlGuidedFallbackOptions() {
    const negativeStep = Number(owlConversationState.negativeCount || 0);
    if (negativeStep > 0 && owlConversationState.mode !== 'advanced') {
        return owlProgressiveFallbackOptions(negativeStep);
    }

    const hasContext = !!owlLastProgramContext();
    let html = '';
    if (hasContext) {
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'сколько стоит эта программа\')">💰 Стоимость</button>';
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'сколько часов эта программа\')">⏱ Часы</button>';
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'какие сроки у этой программы\')">📅 Сроки</button>';
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'покажи похожие программы\')">🧭 Похожие программы</button>';
    } else {
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'какие программы у вас есть\')">📚 Подобрать программу</button>';
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'что есть по повышению квалификации\')">🎓 Повышение квалификации</button>';
        html += '<button class="chat-opt-btn" onclick="owlAskPreset(\'что есть по профессиональной переподготовке\')">🔄 Переподготовка</button>';
    }
    html += '<button class="chat-opt-btn" onclick="showOwlHumanHandoff(\'manual\')">👤 Связаться с сотрудником</button>';
    html += '<button class="chat-opt-btn" onclick="resetMenu()">← Назад</button>';
    return html;
}

function owlAskPreset(text) {
    const input = document.getElementById('chatUserInput');
    if (!input || owlAiRequestInFlight) return;
    if (window.OwlLearning) {
        try { window.OwlLearning.resolvePendingAsPreset(String(text || ''), 'preset-button'); } catch (e) {}
    }
    input.value = String(text || '');
    handleUserMessage();
}

async function handleOwlNegativeFeedback(query) {
    if (!owlIsNegativeFeedback(query)) return false;

    const raw = normalizeText(String(query || '').replace(/ё/g, 'е')).trim();
    const replyPool = owlBrainConfig().negativeReplies || [];
    const currentProgram = owlLastProgramContext();
    const candidates = owlCandidatePrograms();

    // Короткое "нет" после конкретного ответа — это не повод включать
    // "расширенный режим". Сохраняем предмет разговора и уточняем намерение.
    if (/^(нет|неа|не подходит|не подходят|не то|другое|другой вариант|другие варианты)[!?.(\s]*$/i.test(raw)) {
        owlConversationState.negativeCount = 0;
        owlConversationState.advancedNegativeCount = 0;
        saveOwlConversationState();

        if (currentProgram) {
            const title = currentProgram[currentLang === 'ru' ? 'title_ru' : 'title_en'] || '';
            addBotMsg(
                'Понял. Не буду уводить вас в случайные программы.' +
                '<br><span class="owl-guided-hint">Сейчас в контексте: <b>' + escapeOwlText(title) +
                '</b>. Можно уточнить цену, срок, формат или написать, что именно вы хотите найти вместо неё.</span>'
            );
            setOptions(
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'сколько стоит эта программа\')">💰 Цена</button>' +
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'сколько учиться на этой программе\')">📅 Срок</button>' +
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'какой формат у этой программы\')">🎓 Формат</button>' +
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'помоги подобрать программу по моей задаче\')">🧭 Подобрать другое по задаче</button>' +
                '<button class="chat-opt-btn" onclick="resetMenu()">← В меню</button>'
            );
            return true;
        }
    }

    // Если пользователь отвергает список вариантов, не повторяем тот же список.
    if (candidates.length && /не\s+подход|ничего\s+из|друг(ое|ие|ой)|не\s+то/i.test(raw)) {
        owlConversationState.lastCandidateIds = [];
        owlConversationState.negativeCount = 0;
        saveOwlConversationState();
        addBotMsg(
            'Понял, эти варианты исключаем.' +
            '<br><span class="owl-guided-hint">Опишите цель одной фразой: кем хотите работать, какую задачу решать или какую тему изучить.</span>'
        );
        setOptions(
            '<button class="chat-opt-btn" onclick="owlAskPreset(\'хочу сменить профессию\')">🔄 Сменить профессию</button>' +
            '<button class="chat-opt-btn" onclick="owlAskPreset(\'хочу повысить квалификацию по своей работе\')">📈 Повысить квалификацию</button>' +
            '<button class="chat-opt-btn" onclick="owlAskPreset(\'нужна короткая программа до 72 часов\')">⚡ Короткая программа</button>' +
            '<button class="chat-opt-btn" onclick="resetMenu()">← В меню</button>'
        );
        return true;
    }

    // Для явного недовольства оставляем мягкий fallback, но не прыгаем
    // автоматически в расширенный режим.
    owlConversationState.negativeCount = Math.min(3, Number(owlConversationState.negativeCount || 0) + 1);
    saveOwlConversationState();

    const step = Math.max(1, Math.min(3, owlConversationState.negativeCount));
    const reply = owlPickReply(replyPool, 'negativeNormal') || 'Понял. Попробуем иначе.';
    addBotMsg(
        reply +
        '<br><span class="owl-guided-hint">' +
        escapeOwlText(step === 1
            ? 'Напишите тему или профессию одним-двумя словами.'
            : step === 2
                ? 'Можно указать цель: новая профессия, повышение квалификации, срок или бюджет.'
                : 'Если удобнее, опишите рабочую задачу обычной фразой — я попробую найти программы по смыслу.') +
        '</span>'
    );
    setOptions(owlGuidedFallbackOptions());
    return true;
}

function owlTopicTokens(query) {
    const generic = new Set([
        'что','есть','какие','какой','какая','какое','у','вас','по','про','для','мне','нам',
        'хочу','нужно','нужна','нужен','нибудь','что-нибудь','чтонибудь','покажи','найди',
        'курс','курсы','программа','программы','обучение','можно','интересует','интересно',
        'посоветуй','подбери','вариант','варианты'
    ]);
    return owlSmartNormalize(query)
        .split(' ')
        .filter(word => {
            if (word.length < 4 || generic.has(word)) return false;

            // Отсекаем падежные формы служебных слов без перечисления
            // каждой формы отдельно: "программу", "программе", "курсом" и т.п.
            if (/^(программ|курс)(?:а|ы|у|е|ой|ою|ам|ами|ах|ов|ом)?$/i.test(word)) return false;
            if (/^обучени(?:е|я|ю|ем|и)$/i.test(word)) return false;
            if (/^вариант(?:а|ы|у|е|ом|ов|ам|ами|ах)?$/i.test(word)) return false;

            return true;
        });
}

function owlTopicConcepts(token) {
    const word = owlSmartNormalize(token);
    if (!word) return [];

    // Семантические семейства: разные бытовые формулировки должны
    // сопоставляться с официальными названиями программ.
    const families = [
        { test:/^(гос)?закуп|контрактн|44.?фз|223.?фз/, words:['закуп','госзакуп','контрактн','44-фз','223-фз'] },
        { test:/бухгал|бухуч|учет|учетн/, words:['бухгал','бухуч','учет'] },
        { test:/кадр|персонал|hr/, words:['кадр','персонал','hr'] },
        { test:/охран.*труд|безопасн.*труд/, words:['охран труда','безопасн труда'] },
        { test:/пожар|пож.*безопасн/, words:['пожар','пожарн безопасн'] },
        { test:/тамож|экспорт|импорт|вэд/, words:['тамож','экспорт','импорт','вэд'] },
        { test:/туризм|гостини|отел|horeca/, words:['туризм','гостини','отел','horeca'] },
        { test:/нейросет|искусствен.*интеллект|(^|\s)ии($|\s)/, words:['нейросет','искусствен интеллект','ии'] }
    ];

    const family = families.find(item => item.test.test(word));
    return family ? Array.from(new Set([word].concat(family.words))) : [word];
}

function owlLooseWordMatch(a, b) {
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;
    if (a.length >= 5 && b.length >= 5 && a.slice(0,5) === b.slice(0,5)) return true;
    return false;
}

function owlConceptMatchesWords(concepts, words) {
    return concepts.some(concept => {
        const conceptWords = owlWords(concept);
        return conceptWords.every(part => words.some(word => owlLooseWordMatch(part, word)));
    });
}

function owlFindProgramsByTopic(query, limit) {
    const tokens = owlTopicTokens(query);
    if (!tokens.length) return [];

    const ranked = globalPrograms
        .filter(program => program && program.active !== false)
        .map(program => {
            const titleWords = owlWords(program.title_ru || '');
            const descWords = owlWords(
                (program.desc_ru || '') + ' ' +
                (program.long_desc_ru || '') + ' ' +
                (program.official_desc_ru || '') + ' ' +
                (Array.isArray(program.bullets_ru) ? program.bullets_ru.join(' ') : '') + ' ' +
                (program.topics_ru || '') + ' ' +
                (program.sector || '')
            );
            let score = 0;
            let titleHits = 0;
            let bodyHits = 0;

            tokens.forEach(token => {
                const concepts = owlTopicConcepts(token);
                if (owlConceptMatchesWords(concepts, titleWords)) {
                    score += 10;
                    titleHits += 1;
                } else if (owlConceptMatchesWords(concepts, descWords)) {
                    score += 3;
                    bodyHits += 1;
                }
            });

            return { program, score, titleHits, bodyHits };
        })
        .filter(item => item.score > 0)
        .sort((a,b) => (b.titleHits - a.titleHits) || (b.score - a.score));

    if (!ranked.length) return [];

    // Если тема найдена прямо в названии, описание больше не имеет права
    // подтягивать посторонние программы. Иначе оставляем только кандидатов,
    // близких к лучшему результату, вместо искусственного заполнения списка.
    const bestTitleHits = ranked[0].titleHits;
    let filtered = bestTitleHits > 0
        ? ranked.filter(item => item.titleHits === bestTitleHits)
        : ranked;

    const bestScore = filtered.length ? filtered[0].score : 0;
    const minRelevantScore = bestTitleHits > 0
        ? Math.max(7, bestScore * 0.70)
        : Math.max(3, bestScore * 0.72);

    filtered = filtered.filter(item => item.score >= minRelevantScore);

    return filtered
        .slice(0, limit || 8)
        .map(item => item.program);
}

function owlProgramTitleLink(program) {
    const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
    return '<a class="owl-program-title-link" href="' + owlProgramPageUrl(program) +
        '" onclick="owlRememberProgramById(\'' + escapeOwlJsString(program.id) + '\')">' +
        '<span>' + escapeOwlText(program[titleKey] || '') + '</span><span>Открыть →</span></a>';
}

function showOwlProgramVariants(encodedIds) {
    const ids = String(encodedIds || '').split(',').filter(Boolean);
    const programs = ids
        .map(id => globalPrograms.find(program => String(program.id || '') === id))
        .filter(Boolean);

    if (!programs.length) return;

    addBotMsg('У этой программы есть несколько версий. Выберите подходящую по объёму и срокам:');
    let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    programs.forEach(program => {
        html += owlProgramLink(program);
    });
    html += '</div><button class="chat-opt-btn" onclick="resetMenu()">← Назад</button>';
    setOptions(html);
}

function owlGroupedTopicLinks(items) {
    const groups = new Map();

    items.forEach(program => {
        const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
        const title = owlSmartNormalize(program[titleKey] || '');
        if (!groups.has(title)) groups.set(title, []);
        groups.get(title).push(program);
    });

    let html = '';
    groups.forEach(group => {
        if (group.length === 1) {
            html += owlProgramTitleLink(group[0]);
            return;
        }

        const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
        const ids = group.map(program => String(program.id)).join(',');
        html += '<button class="owl-program-title-link" type="button" onclick="showOwlProgramVariants(\'' +
            escapeOwlJsString(ids) + '\')">' +
            '<span>' + escapeOwlText(group[0][titleKey] || '') + '</span>' +
            '<span>' + group.length + ' варианта →</span></button>';
    });

    return html;
}

function owlTopicProgramResult(query) {
    const items = owlFindProgramsByTopic(query, 6);
    if (!items.length) return null;

    owlConversationState.lastCandidateIds = items.map(item => String(item.id));
    saveOwlConversationState();

    const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
    const uniqueTitles = new Set(items.map(item => owlSmartNormalize(item[titleKey] || '')));
    const topic = owlTopicTokens(query)[0] || 'этой теме';
    let options = '<div style="display:flex;flex-direction:column;gap:8px;">' +
        owlGroupedTopicLinks(items) +
        '</div>' +
        '<button class="chat-opt-btn" onclick="resetMenu()">← Назад</button>';

    return {
        handled: true,
        html:
            'По запросу <b>«' + escapeOwlText(topic) + '»</b> нашёл ' +
            '<b>' + uniqueTitles.size + '</b> подходящих программ. Выберите название — откроется полное описание.' +
            '<div class="owl-guided-hint">После выбора можно спросить коротко: «сколько стоит?», «для кого?», «кто ведёт?», «что изучают?»</div>',
        options,
        intent: 'topic-programs'
    };
}

function owlRememberProgram(program) {
    if (!program || !program.id) return;
    owlConversationState.lastProgramId = String(program.id);
    owlConversationState.unresolvedStreak = 0;
    saveOwlConversationState();
}

function owlResetUnresolved() {
    owlConversationState.unresolvedStreak = 0;
    saveOwlConversationState();
}

function owlResetNegativeChain() {
    owlConversationState.negativeCount = 0;
    if (owlConversationState.mode !== 'advanced') {
        owlConversationState.advancedNegativeCount = 0;
    }
    saveOwlConversationState();
}

function owlRegisterUnresolved() {
    owlConversationState.unresolvedStreak = Number(owlConversationState.unresolvedStreak || 0) + 1;
    saveOwlConversationState();
    return owlConversationState.unresolvedStreak;
}

function owlCollectStaffContacts() {
    const cards = Array.from(document.querySelectorAll('#contactsSection .contact-card'));

    return cards.map((card, index) => {
        const name = String(card.querySelector('h4')?.textContent || '').trim();
        const position = String(card.querySelector('.position')?.textContent || '').trim();
        const details = String(card.querySelector('.details')?.innerText || '').replace(/\s+/g, ' ').trim();
        const tel = card.querySelector('a[href^="tel:"]');
        const email = card.querySelector('a[href^="mailto:"]');

        const roomMatch = details.match(/(?:Каб\.?|Room)\s*([A-Za-zА-Яа-я0-9-]+)/i);
        const extMatch = details.match(/(?:доб\.?|ext\.?|extension)\s*([0-9]+)/i);

        const normalizedName = owlSmartNormalize(name);
        const nameParts = normalizedName.split(' ').filter(Boolean);

        return {
            key: 'staff-' + index + '-' + (nameParts[0] || 'person'),
            name,
            position,
            details,
            phoneDisplay: String(tel?.textContent || '').trim(),
            phoneHref: String(tel?.getAttribute('href') || '').trim(),
            email: String(email?.textContent || '').trim(),
            emailHref: String(email?.getAttribute('href') || '').trim(),
            room: roomMatch ? roomMatch[1] : '',
            extension: extMatch ? extMatch[1] : '',
            normalizedName,
            normalizedPosition: owlSmartNormalize(position),
            nameParts
        };
    }).filter(person => person.name);
}

function owlStaffByKey(key) {
    if (!key) return null;
    return owlCollectStaffContacts().find(person => person.key === key) || null;
}

function owlFuzzyStaffWord(queryWord, staffWord) {
    if (!queryWord || !staffWord) return false;
    if (queryWord === staffWord || queryWord.includes(staffWord) || staffWord.includes(queryWord)) return true;

    if (window.OwlLearning && typeof window.OwlLearning.fuzzyWordEqual === 'function') {
        return window.OwlLearning.fuzzyWordEqual(queryWord, staffWord);
    }

    return queryWord.length >= 5 &&
        staffWord.length >= 5 &&
        queryWord.slice(0, 5) === staffWord.slice(0, 5);
}

function owlIsProgramDiscoveryRequest(query) {
    const q = owlSmartNormalize(query);
    if (!q) return false;
    return owlIntent('programs', query) ||
        /(?:^|\s)(?:программ[а-я-]*|курс[а-я-]*|обучен[а-я-]*|переподготов[а-я-]*|квалификац[а-я-]*)/i.test(q) ||
        /(?:^|\s)(?:подбери[а-я-]*|подобрать[а-я-]*|посоветуй[а-я-]*|порекомендуй[а-я-]*|рекомендуй[а-я-]*)/i.test(q) ||
        /что\s+из\s+.*посмотреть|что\s+.*посмотреть|что\s+.*выбрать/i.test(q);
}

function owlIsExplicitStaffRequest(query) {
    const q = owlSmartNormalize(query);
    if (!q) return false;
    return owlStaffContextRequested(query) ||
        /\b(сотрудник|преподавател|директор|заместител|руководител|специалист|методист|контакт|телефон|номер|почт|email|кабинет|кто такая|кто такой|как связат|кому написат|кому позвон)\w*/i.test(q);
}

function owlStaffContextRequested(query) {
    const q = owlSmartNormalize(query);
    return /\b(он|она|ее|её|его|ней|нем|нём|такая|такой|этот человек|эта сотрудница|этот сотрудник)\b/i.test(q) ||
        /^(кто такая|кто такой|кто это|а телефон|а номер|а почта|а email|а кабинет)/i.test(q);
}

function owlFindStaffMatches(query) {
    const q = owlSmartNormalize(query);
    const qWords = q.split(' ').filter(word => word.length >= 3);
    const staff = owlCollectStaffContacts();

    // Карточки сотрудников не должны перехватывать предметные запросы о программах.
    // Ищем человека только когда пользователь действительно спрашивает о сотруднике/
    // контакте либо вводит имя/фамилию, а не при случайном fuzzy-совпадении слова.
    const explicitStaffIntent =
        owlStaffContextRequested(query) ||
        /\b(сотрудник|преподавател|директор|заместител|руководител|специалист|методист|контакт|телефон|номер|почт|email|кабинет|кто такая|кто такой|как связат|кому написат|кому позвон)\w*/i.test(q);

    // Имя само по себе считается явным запросом только при достаточно точном
    // совпадении с ФИО, а не по fuzzy-совпадению любого слова фразы.
    const hasNameEvidence = staff.some(person => {
        const surname = person.nameParts[0] || '';
        const first = person.nameParts[1] || '';
        return qWords.some(word =>
            (surname && word.length >= 4 && (word === surname || surname.startsWith(word) || word.startsWith(surname))) ||
            (first && word.length >= 4 && word === first)
        );
    });

    const programIntent =
        owlIntent('programs', query) ||
        /\b(программ|курс|обучен|повысить квалификац|переподготов|что.*посмотреть|что.*подобрать|подбери|посоветуй)\w*/i.test(q);

    if (programIntent && !explicitStaffIntent && !hasNameEvidence) return [];
    if (!explicitStaffIntent && !hasNameEvidence) return [];

    if (owlStaffContextRequested(query) && owlConversationState.lastStaffKey) {
        const contextual = owlStaffByKey(owlConversationState.lastStaffKey);
        if (contextual) return [contextual];
    }

    const ranked = staff.map(person => {
        let score = 0;
        const surname = person.nameParts[0] || '';
        const first = person.nameParts[1] || '';
        const patronymic = person.nameParts[2] || '';
        const positionWords = person.normalizedPosition.split(' ').filter(word => word.length >= 4);

        qWords.forEach(word => {
            if (owlFuzzyStaffWord(word, surname)) score += 14;
            else if (first && owlFuzzyStaffWord(word, first)) score += 9;
            else if (patronymic && owlFuzzyStaffWord(word, patronymic)) score += 6;

            positionWords.forEach(positionWord => {
                if (owlFuzzyStaffWord(word, positionWord)) score += 3;
            });
        });

        if (person.normalizedName && q.includes(person.normalizedName)) score += 20;
        if (person.normalizedPosition && q.includes(person.normalizedPosition)) score += 18;

        const asksDirector = /директор\s+центра/i.test(q);
        if (asksDirector && person.normalizedPosition === 'директор центра') score += 30;

        const asksDeputy = /заместител.*директор/i.test(q);
        if (asksDeputy && person.normalizedPosition.includes('заместитель директора')) score += 30;

        return { person, score };
    })
    .filter(item => item.score >= 8)
    .sort((a,b) => b.score - a.score);

    if (!ranked.length) return [];

    const top = ranked[0].score;
    return ranked
        .filter(item => item.score >= Math.max(8, top - 3))
        .slice(0, 4)
        .map(item => item.person);
}

function owlRememberStaff(person) {
    if (!person) return;
    owlConversationState.lastStaffKey = person.key;
    saveOwlConversationState();
}

function owlStaffOptions(person) {
    if (!person) return owlContactOptions();

    let html = '';
    if (person.phoneHref) {
        html += '<a class="chat-opt-btn" href="' + escapeOwlText(person.phoneHref) +
            '" style="display:block;text-align:center;text-decoration:none;">📞 Позвонить: ' +
            escapeOwlText(person.phoneDisplay) +
            (person.extension ? ' · доб. ' + escapeOwlText(person.extension) : '') +
            '</a>';
    }
    if (person.emailHref) {
        html += '<a class="chat-opt-btn" href="' + escapeOwlText(person.emailHref) +
            '" style="display:block;text-align:center;text-decoration:none;">✉️ Написать: ' +
            escapeOwlText(person.email) + '</a>';
    }
    html += '<button class="chat-opt-btn" onclick="document.getElementById(\'contactsSection\').scrollIntoView({behavior:\'smooth\'});">👤 Открыть раздел сотрудников</button>';
    html += '<button class="chat-opt-btn" onclick="resetMenu()">← Назад</button>';
    return html;
}

function owlStaffAnswer(person, query) {
    const q = owlSmartNormalize(query);
    const asksPhone = /телефон|номер|позвон|связат/i.test(q);
    const asksEmail = /email|почт|написат/i.test(q);
    const asksRoom = /кабинет|каб\b/i.test(q);
    const asksWho = /кто|должност|кем|такая|такой/i.test(q);
    const disputesPhone = /не\s+(ее|её|его|такой|тот).*телефон|телефон.*не\s+(ее|её|его|такой|тот)/i.test(q);

    let html = '<b>' + escapeOwlText(person.name) + '</b>';
    if (person.position) html += '<br>' + escapeOwlText(person.position);

    if (disputesPhone) {
        html += '<br><br>В карточке сотрудника на этом сайте сейчас указан рабочий телефон: <b>' +
            escapeOwlText(person.phoneDisplay || 'не указан') + '</b>' +
            (person.extension ? ', доб. <b>' + escapeOwlText(person.extension) + '</b>' : '') + '.';
        html += '<br><span class="owl-guided-hint">Если контакт недавно изменился, данные на сайте могли ещё не обновиться.</span>';
        return html;
    }

    if (asksPhone) {
        html += '<br><br>📞 <b>' + escapeOwlText(person.phoneDisplay || 'Телефон не указан') + '</b>';
        if (person.extension) html += ' · доб. <b>' + escapeOwlText(person.extension) + '</b>';
    }

    if (asksEmail) {
        html += '<br>✉️ <b>' + escapeOwlText(person.email || 'E-mail не указан') + '</b>';
    }

    if (asksRoom) {
        html += '<br>🚪 Кабинет: <b>' + escapeOwlText(person.room || 'не указан') + '</b>';
    }

    if (!asksPhone && !asksEmail && !asksRoom) {
        if (person.phoneDisplay) {
            html += '<br><br>📞 ' + escapeOwlText(person.phoneDisplay) +
                (person.extension ? ' · доб. ' + escapeOwlText(person.extension) : '');
        }
        if (person.email) html += '<br>✉️ ' + escapeOwlText(person.email);
        if (person.room) html += '<br>🚪 Каб. ' + escapeOwlText(person.room);
    }

    if (asksWho && person.position) {
        html += '<br><span class="owl-guided-hint">Это сотрудник, указанный в официальном разделе контактов сайта.</span>';
    }

    return html;
}

function owlResolveStaff(query) {
    // Privacy/UX guard: never surface a person or contact unless the user explicitly asks for staff/contact information.
    if (!owlIsExplicitStaffRequest(query)) return null;
    const matches = owlFindStaffMatches(query);
    if (!matches.length) return null;

    if (matches.length === 1) {
        const person = matches[0];
        owlRememberStaff(person);
        return {
            handled: true,
            html: owlStaffAnswer(person, query),
            options: owlStaffOptions(person),
            intent: 'staff-contact'
        };
    }

    let options = '';
    matches.forEach(person => {
        options += '<button class="chat-opt-btn" onclick="owlSelectStaff(\'' +
            escapeOwlJsString(person.key) + '\')">' +
            escapeOwlText(person.name) +
            (person.position ? '<br><span style="font-size:.76rem;opacity:.72;">' + escapeOwlText(person.position) + '</span>' : '') +
            '</button>';
    });
    options += '<button class="chat-opt-btn" onclick="resetMenu()">← Назад</button>';

    return {
        handled: true,
        html: 'Нашёл несколько сотрудников, подходящих под запрос. Выберите нужного:',
        options,
        intent: 'staff-clarify'
    };
}

function owlSelectStaff(key) {
    const person = owlStaffByKey(key);
    if (!person) return;
    if (window.OwlLearning) {
        try { window.OwlLearning.resolvePending('staff', String(key || ''), 'staff-select'); } catch (e) {}
    }
    owlRememberStaff(person);
    addBotMsg(owlStaffAnswer(person, person.name));
    setOptions(owlStaffOptions(person));
}

function owlContactOptions() {
    const contacts = owlBrainConfig().contacts || {};
    return (
        '<a class="chat-opt-btn" href="' + escapeOwlText(safeOwlContactHref(contacts.phoneHref, 'tel:+74012972379')) + '" style="display:block;text-align:center;text-decoration:none;">📞 ' +
            escapeOwlText(contacts.phoneDisplay || '+7 (4012) 97-23-79') + '</a>' +
        '<a class="chat-opt-btn" href="' + escapeOwlText(safeOwlContactHref(contacts.emailHref, 'mailto:cdo-zf@ranepa.ru')) + '" style="display:block;text-align:center;text-decoration:none;">✉️ ' +
            escapeOwlText(contacts.email || 'cdo-zf@ranepa.ru') + '</a>' +
        '<a class="chat-opt-btn" href="' + escapeOwlText(safeOwlContactHref(contacts.vkUrl, 'https://vk.ru/ranepa_dpo39')) + '" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;text-decoration:none;background:rgba(0,119,255,.12);border-color:#2787f5;color:#5aa7ff;">💬 Написать в VK</a>' +
        '<button class="chat-opt-btn" onclick="resetMenu()">⬅️ В меню</button>'
    );
}

function showOwlHumanHandoff(reason) {
    removeOwlThinking();
    const contacts = owlBrainConfig().contacts || {};
    const handoffPool = (owlBrainConfig().replies || {}).handoff || [];
    const prefix = reason === 'repeated'
        ? (owlPickReply(handoffPool, 'handoff') || 'Похоже, я несколько раз не смог точно понять ваш вопрос. Не хочу заставлять вас переформулировать его снова.')
        : 'Если удобнее, можно сразу связаться с сотрудником Центра.';
    addBotMsg(
        prefix +
        '<br><br>📞 <b>' + escapeOwlText(contacts.phoneDisplay || '+7 (4012) 97-23-79') + '</b>' +
        '<br>✉️ <b>' + escapeOwlText(contacts.email || 'cdo-zf@ranepa.ru') + '</b>'
    );
    setOptions(owlContactOptions());
}

function owlVisibleProgramContext() {
    let bestId = '';
    let bestRatio = 0;
    document.querySelectorAll('.tab-content.active .card[data-site-program-id]').forEach(card => {
        const r = card.getBoundingClientRect();
        const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
        const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        const area = Math.max(1, r.width * r.height);
        const ratio = (w * h) / area;
        if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = card.dataset.siteProgramId || '';
        }
    });
    if (bestRatio < .22 || !bestId) return null;
    return globalPrograms.find(p => String(p.id || '') === bestId) || null;
}

function owlLastProgramContext() {
    const id = owlConversationState.lastProgramId;
    if (id) {
        const remembered = globalPrograms.find(p => String(p.id || '') === String(id));
        if (remembered) return remembered;
    }
    return owlVisibleProgramContext();
}

function owlRequestedFacets(query) {
    const facets = [];
    ['price','hours','dates','format','documents','audience','content','outcomes','teachers'].forEach(name => {
        if (owlIntent(name, query)) facets.push(name);
    });

    // Разговорные вопросы о продолжительности часто формулируются без слов
    // "срок" и "длительность": "сколько учиться", "сколько идет курс".
    const raw = normalizeText(String(query || '').replace(/ё/g, 'е'));
    if (
        !facets.includes('dates') &&
        /(сколько\s+(учиться|учатся|идет|идёт|длится)|как\s+долго|на\s+сколько\s+(месяцев|недель)|срок\s+обучения)/i.test(raw)
    ) {
        facets.push('dates');
    }

    if (
        !facets.includes('documents') &&
        /\b(диплом|удостоверение|сертификат|фрдо|документ\w*)\b/i.test(raw) &&
        /\b(выдают|получу|получить|после|окончани|итог|какой)\w*/i.test(raw)
    ) {
        facets.push('documents');
    }

    return facets;
}

function owlWordRoot(word) {
    let w = owlSmartNormalize(word).replace(/[^а-яa-z0-9-]/gi, '');
    if (w.length <= 4) return w;

    // Лёгкий русский стемминг для разговорных падежей:
    // горничную -> горничн, закупками -> закупк, бухгалтерского -> бухгалтерск.
    const endings = [
        'иями','ями','ами','ого','ему','ому','ыми','ими','ую','юю','ая','яя','ое','ее',
        'ые','ие','ый','ий','ой','ых','их','ам','ям','ах','ях','ом','ем','ов','ев',
        'а','я','ы','и','у','ю','е','о','й','ь'
    ];
    for (const ending of endings) {
        if (w.length - ending.length >= 4 && w.endsWith(ending)) {
            w = w.slice(0, -ending.length);
            break;
        }
    }
    return w;
}

function owlTokenSimilar(a, b) {
    const ra = owlWordRoot(a);
    const rb = owlWordRoot(b);
    if (!ra || !rb) return false;
    if (ra === rb) return true;
    const min = Math.min(ra.length, rb.length);
    if (min < 4) return false;
    const prefix = min >= 7 ? 6 : (min >= 5 ? 5 : 4);
    return ra.slice(0, prefix) === rb.slice(0, prefix);
}

function owlProgramSearchAliases(tokens) {
    const result = tokens.slice();
    const add = (...words) => words.forEach(w => {
        if (!result.includes(w)) result.push(w);
    });

    result.forEach(token => {
        const r = owlWordRoot(token);
        if (r.startsWith('закуп') || r === 'госзакуп') add('закупки','контрактная','контрактной','44-фз','223-фз');
        if (r.startsWith('горнич')) add('горничная','гостиница','гостиничный','уборка','номеров');
        if (r.startsWith('бухгалт')) add('бухгалтерский','учет','учёт');
        if (r.startsWith('логист')) add('логистика','цепи','поставок');
        if (r.startsWith('кадр')) add('кадры','персонал','управление персоналом');
        if (r.startsWith('туриз')) add('туризм','гостеприимство','гостиничный');
        if (r.startsWith('гостин')) add('гостиничный','гостеприимство','отель');
        if (r.startsWith('антитер')) add('антитеррор','терроризм','безопасность');
        if (r.startsWith('антикор')) add('антикоррупция','коррупция');
        if (r.startsWith('охран') || r.startsWith('труд')) add('охрана труда','безопасность труда');
        if (r.startsWith('пожар')) add('пожарная','безопасность');
        if (r.startsWith('менедж')) add('менеджмент','управление');
        if (r === 'ии' || r.startsWith('искусствен') || r.startsWith('нейросет')) add('ии','искусственный интеллект','нейросети');
    });

    return result;
}

function owlQueryProgramTokens(query) {
    const generic = new Set([
        'сколько','цена','стоимость','стоит','часы','часов','объем','объём',
        'срок','сроки','дата','даты','форма','обучение','программа','программы',
        'курс','курсы','документ','диплом','удостоверение','сертификат','рублей',
        'руб','какая','какой','какие','кого','есть','меня','вас','этой','эта','эту','этот','это',
        'она','он','они','нее','неё','ней','нему','ним','моей','моя','мой','про','для','скажите','подскажите','пожалуйста',
        'учиться','учатся','учусь','обучаться','длится','идет','идёт','занимает',
        'время','долго','длительность','продолжительность','на'
    ]);

    const normalized = owlSmartNormalize(query);
    const tokens = normalized.split(' ').filter(w => w.length > 2 && !generic.has(w));
    return owlProgramSearchAliases(tokens);
}

function owlProgramCandidates(query) {
    const q = owlSmartNormalize(query);
    const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';

    const exact = globalPrograms.filter(p => {
        const title = owlSmartNormalize(p[titleKey] || '');
        return title.length >= 4 && (q.includes(title) || title.includes(q));
    });
    if (exact.length) return exact;

    const tokens = owlQueryProgramTokens(query);
    if (!tokens.length) {
        const contextual = owlLastProgramContext();
        if (contextual) return [contextual];

        // Если конкретная программа ещё не выбрана, но перед этим Сова показала
        // несколько подходящих вариантов, короткий вопрос "сколько стоит?",
        // "для кого она?" и т.п. относится именно к этой группе. Не ищем заново
        // по всему каталогу и не подставляем случайные программы.
        const recentCandidates = owlCandidatePrograms();
        return recentCandidates.length ? recentCandidates : [];
    }

    const scored = globalPrograms.map(program => {
        const title = owlSmartNormalize(program[titleKey] || '');
        const titleWords = title.split(' ').filter(Boolean);
        const desc = owlSmartNormalize([
            program.desc_ru || '',
            program.long_desc_ru || '',
            program.topics_ru || '',
            Array.isArray(program.bullets_ru) ? program.bullets_ru.join(' ') : '',
            program.type || '',
            program.sector || ''
        ].join(' '));
        const descWords = desc.split(' ').filter(Boolean);

        let score = 0;
        tokens.forEach(token => {
            const titleExact = title.includes(token);
            const titleRoot = titleWords.some(word => owlTokenSimilar(token, word));
            const descExact = desc.includes(token);
            const descRoot = descWords.some(word => owlTokenSimilar(token, word));

            if (titleExact) score += 7;
            else if (titleRoot) score += 6;
            else if (descExact) score += 2;
            else if (descRoot) score += 1.5;
        });

        return { program, score };
    }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);

    if (!scored.length) {
        const contextual = owlLastProgramContext();
        return contextual ? [contextual] : [];
    }

    const top = scored[0].score;
    return scored
        .filter(x => x.score >= Math.max(4.5, top - 2))
        .slice(0, 6)
        .map(x => x.program);
}

function owlProgramAnswer(program, facets) {
    const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
    const rows = [];
    const wanted = facets.length ? facets : ['price','hours','dates','format'];

    wanted.forEach(facet => {
        if (facet === 'price') rows.push('💰 Стоимость: <b>' + escapeOwlText(localizedProgramMeta(program, 'price', currentLang) || 'не указана') + '</b>');
        if (facet === 'hours') rows.push('⏱ Объём: <b>' + escapeOwlText(localizedProgramMeta(program, 'hours', currentLang) || 'не указан') + '</b>');
        if (facet === 'dates') rows.push('📅 Сроки: <b>' + escapeOwlText(localizedProgramMeta(program, 'dates', currentLang) || 'не указаны') + '</b>');
        if (facet === 'format') rows.push('🎓 Форма: <b>' + escapeOwlText(localizedProgramMeta(program, 'format', currentLang) || 'не указана') + '</b>');
        if (facet === 'documents') {
            let doc = currentLang === 'ru' ? program.document_ru : program.document_en;

            if (!doc && currentLang === 'ru') {
                const facts = (owlBrainConfig().siteFacts || {}).outcomeDocuments || {};
                const byType = facts.byType || {};
                const type = owlSmartNormalize(program.type || '');

                if (type.includes('повышение квалификации')) {
                    doc = byType['повышение квалификации'] || '';
                } else if (type.includes('переподготов')) {
                    doc = byType['профессиональная переподготовка'] || byType['проф. переподготовка'] || '';
                }
            }

            rows.push('📄 Документ: <b>' + escapeOwlText(doc || 'для этой программы на сайте отдельно не указан') + '</b>');
        }
        if (facet === 'audience') {
            const value = currentLang === 'ru' ? program.audience_ru : program.audience_en;
            rows.push('👥 Для кого: <b>' + escapeOwlText(value || 'в данных программы не указано') + '</b>');
        }
        if (facet === 'content') {
            const value = currentLang === 'ru'
                ? (program.topics_ru || (Array.isArray(program.bullets_ru) ? program.bullets_ru.join('; ') : ''))
                : (program.topics_en || (Array.isArray(program.bullets_en) ? program.bullets_en.join('; ') : ''));
            rows.push('📚 Содержание: <b>' + escapeOwlText(value || 'в данных программы не раскрыто') + '</b>');
        }
        if (facet === 'outcomes') {
            const value = currentLang === 'ru' ? program.outcomes_ru : program.outcomes_en;
            rows.push('🎯 Результаты: <b>' + escapeOwlText(value || 'в данных программы не указаны') + '</b>');
        }
        if (facet === 'teachers') {
            const value = currentLang === 'ru'
                ? (program.teachers_ru || program.experts_ru)
                : (program.teachers_en || program.experts_en);
            rows.push('👨‍🏫 Преподаватели: <b>' + escapeOwlText(value || 'в данных программы не указаны') + '</b>');
        }
    });

    return '<b>' + escapeOwlText(program[titleKey] || '') + '</b><br><br>' + rows.join('<br>');
}

function owlProgramActionOptions(program) {
    const id = escapeOwlJsString(program && program.id || '');
    return (
        '<div class="owl-guided-hint" style="margin:2px 0 8px;">Могу сразу уточнить следующий шаг:</div>' +
        '<button class="chat-opt-btn" onclick="owlRememberProgramById(\'' + id + '\');owlAskPreset(\'сколько стоит эта программа?\')">💰 Стоимость</button>' +
        '<button class="chat-opt-btn" onclick="owlRememberProgramById(\'' + id + '\');owlAskPreset(\'сколько длится эта программа?\')">⏱ Срок и часы</button>' +
        '<button class="chat-opt-btn" onclick="owlRememberProgramById(\'' + id + '\');owlAskPreset(\'какой документ выдают после этой программы?\')">🎓 Итоговый документ</button>' +
        '<a class="chat-opt-btn" href="' + owlProgramPageUrl(program) + '" style="display:block;text-align:center;text-decoration:none;background:linear-gradient(135deg,rgba(202,15,62,.22),rgba(56,189,248,.14));border-color:rgba(202,15,62,.55);">📘 Полное описание программы</a>' +
        '<button class="chat-opt-btn" onclick="openModal()">✍️ Записаться</button>' +
        '<button class="chat-opt-btn" onclick="resetMenu()">⬅️ В меню</button>'
    );
}

function owlCategoryPrograms(query) {
    let filtered = [];
    if (owlIntent('advancedTraining', query)) {
        filtered = globalPrograms.filter(p => owlSmartNormalize(p.type || '').includes('повышение квалификации'));
    } else if (owlIntent('retraining', query)) {
        filtered = globalPrograms.filter(p => owlSmartNormalize(p.type || '').includes('переподготов'));
    } else if (owlIntent('professionalTraining', query)) {
        filtered = globalPrograms.filter(p => owlSmartNormalize(p.type || '').includes('профессиональн'));
    } else if (owlIntent('seminars', query)) {
        filtered = globalPrograms.filter(p => String(p.tab || '') === 'tab-sem');
    }
    return filtered.filter(p => p.active !== false);
}

function owlProgramPageUrl(program) {
    return 'program.html?id=' + encodeURIComponent(program.id) + '&lang=' + encodeURIComponent(currentLang);
}

function owlProgramLink(program, label) {
    const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
    const price = localizedProgramMeta(program, 'price', currentLang) || '—';
    const hours = localizedProgramMeta(program, 'hours', currentLang) || '—';
    const type = localizedProgramMeta(program, 'type', currentLang) || '';
    return '<a class="owl-program-link" href="' + owlProgramPageUrl(program) + '" onclick="owlRememberProgramById(\'' +
        escapeOwlJsString(program.id) + '\')">' +
        '<span class="owl-program-link-title">' + escapeOwlText(program[titleKey] || '') + '</span>' +
        '<span class="owl-program-link-meta"><span>💰 ' + escapeOwlText(price) + '</span><span>⏱ ' +
        escapeOwlText(hours) + '</span>' + (type ? '<span>🎓 ' + escapeOwlText(type) + '</span>' : '') + '</span>' +
        '<span class="owl-program-link-cta">' + escapeOwlText(label || (currentLang === 'ru' ? 'Открыть программу →' : 'Open program →')) + '</span>' +
        '</a>';
}

function owlRememberProgramById(id) {
    const program = globalPrograms.find(p => String(p.id || '') === String(id));
    if (program) {
        if (window.OwlLearning) {
            try { window.OwlLearning.resolvePending('program', String(id || ''), 'program-select'); } catch (e) {}
        }
        owlRememberProgram(program);
    }
}

function owlNumeric(value) {
    const n = parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
}

function owlWords(value) {
    return owlSmartNormalize(value).split(' ').filter(word => word.length > 3);
}

function owlProgramSemanticWords(program) {
    const raw = [
        program && program.title_ru || '',
        program && program.desc_ru || '',
        program && program.long_desc_ru || '',
        program && program.topics_ru || '',
        Array.isArray(program && program.bullets_ru) ? program.bullets_ru.join(' ') : ''
    ].join(' ');

    const stop = new Set([
        'программа','обучение','слушатели','специалисты','управление','основы','вопросы',
        'профессиональный','профессиональная','повышение','квалификации','развитие',
        'полученные','успешно','материал','деятельность','организация','организации'
    ]);

    const base = owlSmartNormalize(raw).split(' ')
        .filter(w => w.length >= 4 && !stop.has(w));

    return owlProgramSearchAliases(base);
}

function owlRelatedPrograms(program, limit) {
    if (!program) return [];

    const sourceWords = owlProgramSemanticWords(program);
    const sourceTitle = owlSmartNormalize(program.title_ru || '').split(' ').filter(w => w.length >= 4);

    return globalPrograms
        .filter(candidate => candidate && candidate.active !== false && String(candidate.id) !== String(program.id))
        .filter(candidate => owlSmartNormalize(candidate.title_ru || '') !== owlSmartNormalize(program.title_ru || ''))
        .map(candidate => {
            const candidateWords = owlProgramSemanticWords(candidate);
            const candidateTitle = owlSmartNormalize(candidate.title_ru || '').split(' ').filter(w => w.length >= 4);

            let semantic = 0;
            let titleSemantic = 0;

            sourceWords.forEach(a => {
                if (candidateWords.some(b => owlTokenSimilar(a, b))) semantic += 1;
            });
            sourceTitle.forEach(a => {
                if (candidateTitle.some(b => owlTokenSimilar(a, b))) titleSemantic += 1;
            });

            // Не рекомендуем программу только потому, что она из того же сектора.
            // Нужна реальная тематическая связь по словам/корням.
            if (semantic === 0 && titleSemantic === 0) {
                return { candidate, score: 0 };
            }

            let score = semantic * 3 + titleSemantic * 7;
            if (candidate.type && program.type &&
                owlSmartNormalize(candidate.type) === owlSmartNormalize(program.type)) score += 1.5;
            if (candidate.sector && program.sector && candidate.sector === program.sector) score += 1;

            return { candidate, score };
        })
        .filter(item => item.score >= 4)
        .sort((a,b) => b.score - a.score)
        .slice(0, limit || 3)
        .map(item => item.candidate);
}

function owlRecommendationBlock(program) {
    const items = owlRelatedPrograms(program, 3);
    if (!items.length) return '';

    owlConversationState.lastCandidateIds = items.map(item => String(item.id));
    saveOwlConversationState();

    return '<div style="margin-top:12px;font-size:.82rem;font-weight:850;color:var(--text-muted);">' +
        'Если нужен другой вариант по той же теме, вот действительно близкие программы:' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">' +
        items.map(item => owlProgramLink(item)).join('') +
        '</div>';
}

function resolveOwlLocally(query) {
    const brain = owlBrainConfig();
    const replies = brain.replies || {};
    const facets = owlRequestedFacets(query);
    const hardProgramIntent = owlIsProgramDiscoveryRequest(query);
    const hardStaffIntent = owlIsExplicitStaffRequest(query);

    // Жёсткий маршрутизатор: программный запрос не может уйти в карточку сотрудника.
    // Это правило выше fuzzy-поиска и выше старого разговорного контекста.
    if (hardProgramIntent && !hardStaffIntent) {
        owlConversationState.lastStaffKey = null;
        saveOwlConversationState();
    } else {
        const staffResolution = owlResolveStaff(query);
        if (staffResolution && staffResolution.handled) {
            return staffResolution;
        }
    }

    if (owlIntent('contacts', query)) {
        return {
            handled: true,
            html: 'Конечно. Можно связаться с сотрудниками Центра напрямую:',
            options: owlContactOptions(),
            intent: 'contacts'
        };
    }

    if (owlIntent('schedule', query)) {
        return {
            handled: true,
            html: 'Расписание можно открыть прямо здесь, не выходя из чата.',
            options: '<button class="chat-opt-btn" onclick="showSchedule()">📅 Открыть расписание</button>' + owlContactOptions(),
            intent: 'schedule'
        };
    }

    if (owlIntent('enroll', query) && !facets.length) {
        return {
            handled: true,
            html: 'Помогу с записью. Можно сразу открыть форму записи или связаться с сотрудником, если нужна консультация.',
            options: '<button class="chat-opt-btn" onclick="openModal()">✍️ Записаться на обучение</button>' + owlContactOptions(),
            intent: 'enroll'
        };
    }

    if (owlIntent('greeting', query)) {
        return { handled:true, html:owlPickReply(replies.greeting, 'greeting'), options:'', intent:'greeting' };
    }

    if (owlIntent('thanks', query)) {
        const normalizedThanks = owlSmartNormalize(query);
        const thankWords = normalizedThanks.split(' ').filter(Boolean);
        const isPureThanks = thankWords.length <= 4 &&
            !/\b(документ|программ|курс|цена|стоим|срок|учиться|формат|закуп|логист|бухгалт|горнич)\w*/i.test(normalizedThanks);

        if (isPureThanks) {
            return { handled:true, html:owlPickReply(replies.thanks, 'thanks'), options:'', intent:'thanks' };
        }
    }

    if (owlIntent('capabilities', query)) {
        return { handled:true, html:owlPickReply(replies.capabilities, 'capabilities'), options:'', intent:'capabilities' };
    }

    if (owlIntent('similar', query) || owlIntent('recommendations', query)) {
        const contextual = owlLastProgramContext();
        if (contextual) {
            const related = owlRelatedPrograms(contextual, 3);
            if (related.length) {
                const variants = (owlBrainConfig().replies || {}).recommendations || [];
                return {
                    handled: true,
                    html: owlPickReply(variants, 'recommendations'),
                    options: '<div style="display:flex;flex-direction:column;gap:8px;">' +
                        related.map(program => owlProgramLink(program)).join('') +
                        '</div>',
                    intent: 'recommendations'
                };
            }
        }
    }

    const categoryPrograms = owlCategoryPrograms(query);
    const asksPrograms = owlIntent('programs', query) || categoryPrograms.length > 0;

    if (asksPrograms && categoryPrograms.length) {
        const introPool = (owlBrainConfig().replies || {}).programIntro || [];
        let html = owlPickReply(introPool, 'programIntro') || ('В этой категории сейчас <b>' + categoryPrograms.length + '</b> программ.');
        html += '<br><br><span style="font-size:.8rem;color:var(--text-muted);">Найдено: <b>' + categoryPrograms.length + '</b></span>';
        let options = '<div style="display:flex;flex-direction:column;gap:8px;">';
        categoryPrograms.slice(0, 6).forEach(program => {
            options += owlProgramLink(program);
        });
        options += '</div><button class="chat-opt-btn" onclick="offerAllPrograms(true)">📚 Показать весь каталог</button>';
        return { handled:true, html, options, intent:'programs' };
    }

    const normalizedQuery = owlSmartNormalize(query);

    // "Помоги подобрать программу по моей задаче" — это начало подбора,
    // а не неизвестный запрос.
    if (/подобр|подбер|помоги.*программ|по моей задаче|по задаче/i.test(normalizedQuery) && !facets.length) {
        return {
            handled:true,
            html:'Конечно. Напишите задачу своими словами — например: «работаю в закупках, хочу разобраться в 44-ФЗ», «хочу работать логистом», «нужна новая профессия в гостинице».',
            options:
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'хочу работать в логистике\')">🚚 Хочу работать в логистике</button>' +
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'работаю в закупках, хочу повысить квалификацию\')">📑 Работаю в закупках</button>' +
                '<button class="chat-opt-btn" onclick="owlAskPreset(\'хочу новую профессию в гостинице\')">🏨 Новая профессия в гостинице</button>' +
                '<button class="chat-opt-btn" onclick="resetMenu()">← В меню</button>',
            intent:'task-discovery'
        };
    }

    // Короткая тема или профессия без вопросительного слова:
    // "логистика", "на логистику", "горничная", "закупки".
    if (!facets.length) {
        const topicCandidates = owlProgramCandidates(query);
        const wordCount = normalizedQuery.split(' ').filter(Boolean).length;
        const looksLikeTopic = wordCount <= 5 &&
            !owlIntent('greeting', query) &&
            !owlIntent('thanks', query) &&
            !owlIntent('contacts', query);

        if (looksLikeTopic && topicCandidates.length) {
            const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
            owlConversationState.lastCandidateIds = topicCandidates.map(p => String(p.id));
            saveOwlConversationState();

            if (topicCandidates.length === 1) {
                const program = topicCandidates[0];
                owlRememberProgram(program);
                return {
                    handled:true,
                    html:
                        'Нашёл программу по вашему запросу:<br><br><b>' +
                        escapeOwlText(program[titleKey] || '') + '</b>' +
                        '<br>💰 ' + escapeOwlText(localizedProgramMeta(program, 'price', currentLang) || '—') +
                        '<br>⏱ ' + escapeOwlText(localizedProgramMeta(program, 'hours', currentLang) || '—') +
                        '<br>📅 ' + escapeOwlText(localizedProgramMeta(program, 'dates', currentLang) || '—'),
                    options:owlProgramActionOptions(program),
                    intent:'topic-program'
                };
            }

            owlConversationState.lastProgramId = null;
            saveOwlConversationState();

            return {
                handled:true,
                html:'По этой теме нашёл несколько подходящих программ. Они отличаются направленностью, объёмом и сроками:',
                options:'<div style="display:flex;flex-direction:column;gap:8px;">' +
                    topicCandidates.map(program => owlProgramLink(program)).join('') +
                    '</div><button class="chat-opt-btn" onclick="resetMenu()">← В меню</button>',
                intent:'topic-programs'
            };
        }
    }

    if (facets.length) {
        const candidates = owlProgramCandidates(query);
        if (candidates.length === 1) {
            const program = candidates[0];
            owlRememberProgram(program);
            return {
                handled:true,
                html:owlProgramAnswer(program, facets) + owlRecommendationBlock(program),
                options:owlProgramActionOptions(program),
                intent:'program-facts'
            };
        }

        if (candidates.length > 1) {
            const titleKey = currentLang === 'ru' ? 'title_ru' : 'title_en';
            const titles = new Set(candidates.map(p => owlSmartNormalize(p[titleKey] || '')));
            const asksDates = facets.includes('dates');
            const asksHours = facets.includes('hours');
            let options = '';

            candidates.forEach(program => {
                const meta = [];
                if (asksDates) meta.push('📅 ' + escapeOwlText(localizedProgramMeta(program, 'dates', currentLang) || 'срок не указан'));
                if (asksHours) meta.push('⏱ ' + escapeOwlText(localizedProgramMeta(program, 'hours', currentLang) || 'часы не указаны'));
                if (!meta.length) {
                    meta.push('💰 ' + escapeOwlText(localizedProgramMeta(program, 'price', currentLang)));
                    meta.push('⏱ ' + escapeOwlText(localizedProgramMeta(program, 'hours', currentLang)));
                }

                options += '<button class="chat-opt-btn" onclick="showProgramDetailsById(\'' + escapeOwlJsString(program.id) + '\')">' +
                    escapeOwlText(program[titleKey] || '') + '<br><span style="font-size:.76rem;opacity:.75;">' +
                    meta.join(' · ') + '</span></button>';
            });

            let intro;
            if (asksDates) {
                intro = 'По этой теме есть несколько программ с разной продолжительностью. Вот сроки по найденным вариантам:';
            } else if (asksHours) {
                intro = 'По этой теме есть несколько программ разного объёма. Вот варианты по часам:';
            } else {
                intro = titles.size === 1
                    ? 'У этой программы есть несколько вариантов. Чтобы не назвать неверную стоимость или срок, выберите нужный:'
                    : 'Нашёл несколько похожих программ. Какая из них имеется в виду?';
            }

            return {
                handled:true,
                html:intro,
                options,
                intent:'program-clarify'
            };
        }
    }

    return { handled:false };
}

async function presentOwlLocal(result, query) {
    if (!result || !result.handled) return false;
    setOwlAiBusy(true);
    showOwlThinking();
    const delay = Math.min(720, 260 + String(query || '').length * 5 + Math.floor(Math.random() * 140));
    await new Promise(resolve => setTimeout(resolve, delay));
    removeOwlThinking();
    addBotMsg(result.html || '');
    if (result.options) setOptions(result.options);
    owlConversationState.lastIntent = result.intent || null;
    owlResetUnresolved();
    owlResetNegativeChain();
    setOwlAiBusy(false);
    const input = document.getElementById('chatUserInput');
    if (input) input.focus();
    return true;
}

loadOwlConversationState();
updateOwlModeUI();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOwlWindowControls, { once:true });
} else {
    initOwlWindowControls();
}


function showOwlHelp() {
    addUserMsg(currentLang === 'ru' ? 'Что ты умеешь?' : 'What can you do?');
    addBotMsg(currentLang === 'ru'
        ? '<b>Я могу помочь с сайтом ДПО:</b><br>' +
          '• подобрать программу по теме, профессии, сроку или формату;<br>' +
          '• уточнить стоимость, часы, сроки, форму обучения и преподавателя;<br>' +
          '• подсказать документы для поступления и итоговый документ;<br>' +
          '• показать расписание занятий;<br>' +
          '• найти контакты сотрудника;<br>' +
          '• открыть материалы преподавателя по выданному коду;<br>' +
          '• помочь с каталогом и профориентационным тестом;<br>' +
          '• в <b>Расширенном режиме</b> разобрать более свободный или сложный вопрос с учётом контекста разговора.' +
          '<br><br><span class="owl-guided-hint">Пишите обычными словами. Чем конкретнее цель, тем точнее ответ. Например: «подбери программу по закупкам до 72 часов», «сколько стоит эта программа?», «какие документы нужны?», «покажи расписание».</span>'
        : '<b>I can help with DPO programs and site information:</b><br>' +
          '• find a program by topic, profession, duration or format;<br>' +
          '• clarify tuition, hours, dates, format and instructors;<br>' +
          '• explain admission and completion documents;<br>' +
          '• show the class schedule and staff contacts;<br>' +
          '• open instructor materials by code;<br>' +
          '• use Advanced mode for freer, contextual questions.' +
          '<br><br><span class="owl-guided-hint">Write naturally. More context usually gives a more precise answer.</span>'
    );
    setOptions(currentLang === 'ru'
        ? '<button class="chat-opt-btn" onclick="owlAskPreset(\'подбери программу по госзакупкам\')">🔎 Подобрать по теме</button>' +
          '<button class="chat-opt-btn" onclick="owlAskPreset(\'какие документы нужны для поступления\')">📎 Документы</button>' +
          '<button class="chat-opt-btn" onclick="owlAskPreset(\'покажи расписание\')">📅 Расписание</button>' +
          '<button class="chat-opt-btn" onclick="resetMenu()">← В меню</button>'
        : '<button class="chat-opt-btn" onclick="resetMenu()">← Menu</button>'
    );
}

function owlUpdateInputHint() {
    const input = document.getElementById('chatUserInput');
    if (!input) return;
    input.placeholder = currentLang === 'ru'
        ? 'Например: «подбери программу по закупкам» или «какие документы нужны?»'
        : 'For example: “find a program about procurement”';
}

function resetMenu() {
    chatBody.innerHTML = `<div class="msg-bot"><b>${currentLang === 'ru' ? 'Сова:' : 'Owl:'}</b> <span>${currentLang === 'ru'
        ? 'Здравствуйте. Пишите своими словами — можно коротко. Например: «подбери программу по закупкам», «сколько стоит?», «какие документы нужны?».'
        : 'Hello. Write naturally — short questions are fine. For example: “find a procurement program” or “what documents are required?”.'
    }</span></div>`;
    owlUpdateInputHint();
    setOptions(`
        <button class="chat-opt-btn" data-site-owl-control="test" onclick="startTest()">${translationsHTML[currentLang].owlOpt1}</button>
        <button class="chat-opt-btn" data-site-owl-control="catalog" onclick="showCatalog()">${translationsHTML[currentLang].owlOpt2}</button>

        <button class="chat-opt-btn" data-site-owl-control="news" onclick="window.location.href='news.html';" style="background: rgba(202, 15, 62, 0.1); border-color: var(--ranepa-red); color: var(--ranepa-red);">
            📰 ${currentLang === 'ru' ? 'Новости центра' : 'Center news'}
        </button>
        
        <button class="chat-opt-btn" data-site-owl-control="schedule" onclick="showSchedule()" style="background: rgba(56, 189, 248, 0.1); border-color: #38bdf8; color: #38bdf8;">
            📅 <span data-i18n="schBtnText">${currentLang === 'ru' ? 'Расписание занятий' : 'Class Schedule'}</span>
        </button>

        <button class="chat-opt-btn" data-site-owl-control="contacts" onclick="document.getElementById('contactsSection').scrollIntoView({behavior: 'smooth'}); toggleChat();">${translationsHTML[currentLang].owlOpt3}</button>

        <button class="chat-opt-btn" data-site-owl-control="help" onclick="showOwlHelp()" style="background:rgba(148,163,184,.08);">
            💡 ${currentLang === 'ru' ? 'Что я умею и как спрашивать' : 'What I can do'}
        </button>
        
        <!-- ИЗМЕНЕННАЯ КНОПКА (ССЫЛКА) -->
        <a href="ai-lecture.html" target="_blank" rel="noopener noreferrer" class="chat-opt-btn" data-site-owl-control="ai" style="background: linear-gradient(135deg, #8b5cf6, #3b82f6); border-color: #8b5cf6; text-align: center; font-size: 0.9rem; text-decoration: none; display: block; color: #fff; box-sizing: border-box;">
            🔮 <span data-i18n="aiLabText">${currentLang === 'ru' ? 'AR-Лаборатория: Практика ИИ' : 'AR-Lab: AI Practice'}</span>
        </a>
    `);
}

function showUrgentAlert() {
    if (globalAlert && globalAlert.text) {
        const alertModal = document.getElementById('urgentAlertModal');
        if (!alertModal) return;

        renderUrgentAlertText();
        alertModal.classList.add('active');
    }
}

function closeUrgentAlertModal() {
    document.getElementById('urgentAlertModal').classList.remove('active');
}

function showCatalog() {
    addUserMsg(currentLang === 'ru' ? "Расскажите о программах." : "Tell me about the programs.");
    addBotMsg(botTexts[currentLang].catPrompt);
    setOptions(`
        <button class="chat-opt-btn" onclick="focusTab('tab-kadry')">${botTexts[currentLang].optKadry}</button>
        <button class="chat-opt-btn" onclick="focusTab('tab-pk')">${botTexts[currentLang].optPk}</button>
        <button class="chat-opt-btn" onclick="focusTab('tab-pp')">${botTexts[currentLang].optPp}</button>
        <button class="chat-opt-btn" onclick="focusTab('tab-po')">${botTexts[currentLang].optPo}</button>
        <button class="chat-opt-btn" onclick="focusTab('tab-sem')">${botTexts[currentLang].optSem}</button>
        <button class="chat-opt-btn" onclick="resetMenu()">${botTexts[currentLang].optBack}</button>
    `);
}

let currentQ = 0;
let scores = { gos: 0, biz: 0, horeca: 0, prof: 0 };

function startTest() {
    addUserMsg(currentLang === 'ru' ? "Инициировать профильное тестирование." : "Initiate career profiling test.");
    addBotMsg(botTexts[currentLang].testStart);
    currentQ = 0;
    scores = { gos: 0, biz: 0, horeca: 0, prof: 0 };
    setTimeout(askQuestion, 700);
}

function askQuestion() {
    if (currentQ >= testQuestionsData[currentLang].length) { showTestResult(); return; }
    const q = testQuestionsData[currentLang][currentQ];
    addBotMsg(q.q);
    let html = '';
    q.answers.forEach(a => {
        html += `<button class="chat-opt-btn" onclick="answerTest('${escapeOwlJsString(a.t)}', '${escapeOwlJsString(a.v)}')">${escapeOwlText(a.t)}</button>`;
    });
    setOptions(html);
}

function answerTest(text, value) {
    addUserMsg(text);
    scores[value]++;
    currentQ++;
    setTimeout(askQuestion, 350);
}

function showTestResult() {
    let maxScore = -1, bestCategory = 'gos';
    for (const key in scores) { if (scores[key] > maxScore) { maxScore = scores[key]; bestCategory = key; } }
    const resultKey = { gos: 'resGos', biz: 'resBiz', horeca: 'resHoreca', prof: 'resProf' }[bestCategory];
    addBotMsg((currentLang === 'ru' ? "Анализ завершен. " : "Analysis completed. ") + botTexts[currentLang][resultKey]);
    setOptions(`
        <button class="chat-opt-btn" onclick="openModal()">${botTexts[currentLang].resEnroll}</button>
        <button class="chat-opt-btn" onclick="focusTab('tab-all');">${botTexts[currentLang].resCat}</button>
        <button class="chat-opt-btn" onclick="resetMenu()">${botTexts[currentLang].optBack}</button>
    `);
}

