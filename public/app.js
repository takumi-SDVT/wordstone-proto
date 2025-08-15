// API_BASEをコードの先頭に移動
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:5173' 
  : 'https://wordbook-ai.vercel.app';

// 単語帳データの置き場

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}

const decks = new Map();

function saveDecks() {
  console.log('Saving decks:', [...decks.values()]);
  try {
    localStorage.setItem('decks', JSON.stringify([...decks.values()]));
  } catch (e) {
    console.error('Save failed:', e);
    showToast('保存に失敗しました');
  }
}

function loadDecks() {
  try {
    const data = localStorage.getItem('decks');
    if (data) {
      const parsed = JSON.parse(data);
      decks.clear();
      parsed.forEach(deck => decks.set(deck.id, deck));
    }
  } catch (e) {
    console.error('Load failed:', e);
    decks.clear();
  }
  loadFolders(); // フォルダ読み込みを追加
  renderHistory();
}

// renderHistory を更新（検索フィルタリング対応）
function renderHistory(searchTerm = '') {
  const historyEl = document.getElementById('history');
  historyEl.innerHTML = '';
  const filteredDecks = Array.from(decks.values()).filter(deck =>
    deck.title.toLowerCase().includes(searchTerm.toLowerCase())
  );
  if (filteredDecks.length === 0) {
    historyEl.innerHTML = `<p class="muted">${
      decks.size === 0 ? '履歴がありません。新しい単語帳を生成してください。' : '一致する単語帳がありません。'
    }</p>`;
    return;
  }
  for (const deck of filteredDecks.reverse()) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div>
        <div class="item-title">${escapeHTML(deck.title)}</div>
        <div class="item-meta">最終使用: ${deck.lastUsed ?? '未使用'} | 進捗: ${deck.progress ? `${Math.round(deck.progress.correct / deck.progress.total * 100)}% (${deck.progress.correct}/${deck.progress.total})` : '未学習'}</div>
      </div>
      <button class="btn btn-danger delete-btn">削除</button>
    `;
    item.querySelector('.item-title').addEventListener('click', () => go(`#/deck/${deck.id}`));
    const deleteBtn = item.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        console.log('Delete button clicked for deck:', deck.id);
        if (confirm('この単語帳を削除しますか？')) {
          decks.delete(deck.id);
          // フォルダのdeckIdsからも削除
          folders.forEach(folder => {
            folder.deckIds = folder.deckIds.filter(id => id !== deck.id);
          });
          saveDecks();
          saveFolders();
          showToast('単語帳を削除しました');
          renderHistory(searchTerm); // 検索状態を維持
        }
      });
    }
    historyEl.appendChild(item);
  }
}

function renderDeckDetail(deck) {
  const detailEl = document.getElementById('detail');
  const isEditMode = deck.isEditMode || false;
  console.log('renderDeckDetail:', { id: deck.id, isEditMode });
  const head = isEditMode
    ? `<input class="title-input" data-title value="${escapeAttr(deck.title)}" placeholder="見出し">`
    : `<div class="section-title">${escapeHTML(deck.title)}</div>`;
  const recipe = isEditMode
    ? `
      <div style="margin-top:10px;">
        <input class="recipe-input" data-topic value="${escapeAttr(deck.meta.topic || '')}" placeholder="お題">
        <input class="recipe-input" data-backKind value="${escapeAttr(deck.meta.backKind || '')}" placeholder="裏面">
        <input class="recipe-input" data-extraKind value="${escapeAttr(deck.meta.extraKind || '')}" placeholder="補足">
        <input class="recipe-input" data-request value="${escapeAttr(deck.meta.request || '')}" placeholder="要望">
      </div>`
    : `
      <div style="color:var(--muted);font-size:14px;">
        お題: ${escapeHTML(deck.meta.topic || '未設定')} |
        裏面: ${escapeHTML(deck.meta.backKind || '説明')} |
        補足: ${escapeHTML(deck.meta.extraKind || '補足')} |
        要望: ${escapeHTML(deck.meta.request || 'なし')} |
        件数: ${deck.meta.count || 0}
      </div>`;
  // インデックスを有効な範囲に制限、空デッキなら0
  const currentCardIndex = Math.min(
    Math.max(0, deck.currentCardIndex || 0),
    deck.cards.length > 0 ? deck.cards.length - 1 : 0
  );
  const cardViewMode = deck.cardViewMode || 'front';
  let rows = deck.cards.length === 0 ? '<p>単語がありません</p>' : isEditMode
    ? `<table>
        <tr><th>単語</th><th>説明</th><th>補足</th></tr>
        ${deck.cards.map((c, i) => `
          <tr data-card-index="${i}">
            <td>
              <div class="edit-field-container">
                <input data-front value="${escapeAttr(c.front)}" placeholder="単語">
                <button class="regen-front btn">単語再生成</button>
                <button class="delete-btn-card btn">単語削除</button>
              </div>
            </td>
            <td>
              <div class="edit-field-container">
                <textarea data-back rows="3" placeholder="説明">${escapeAttr(c.back)}</textarea>
                <button class="regen-back btn">説明再生成</button>
              </div>
            </td>
            <td>
              <div class="edit-field-container">
                <textarea data-extra rows="3" placeholder="補足">${escapeAttr(c.extra || '')}</textarea>
                <button class="regen-extra btn">補足再生成</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </table>`
    : `
      <div class="card-nav">
        <button class="btn prev-card" ${currentCardIndex === 0 ? 'disabled' : ''}>← 前のカード</button>
        <span>${currentCardIndex + 1}/${deck.cards.length}</span>
        <button class="btn next-card" ${currentCardIndex === deck.cards.length - 1 ? 'disabled' : ''}>次のカード →</button>
      </div>
      <div class="preview-card" data-card-index="${currentCardIndex}">
        <div class="card-face ${cardViewMode}">
          ${cardViewMode === 'front' ? escapeHTML(deck.cards[currentCardIndex]?.front || '') :
            cardViewMode === 'back' ? escapeHTML(deck.cards[currentCardIndex]?.back || '') :
            escapeHTML(deck.cards[currentCardIndex]?.extra || '')}
        </div>
        ${cardViewMode !== 'extra' ? `<button class="btn toggle-extra" style="position:absolute;bottom:10px;right:10px;">補足</button>` : ''}
      </div>
      ${deck.cards.length > 0 ? `
        <div class="card-slider-container">
          <input type="range" class="card-slider" min="0" max="${deck.cards.length - 1}" value="${currentCardIndex}">
          <span class="card-slider-value">${currentCardIndex + 1}/${deck.cards.length}</span>
        </div>` : ''}
      <div style="margin:10px 0;">
        <button class="btn btn-primary study-btn" style="width:100%;padding:12px;" ${isEditMode ? 'hidden' : ''}>暗記モード</button>
      </div>
      <table style="margin-top:20px;">
        <tr><th>単語</th><th>説明</th><th>補足</th></tr>
        ${deck.cards.map(c => `
          <tr>
            <td>${escapeHTML(c.front)}</td>
            <td>${escapeHTML(c.back)}</td>
            <td>${escapeHTML(c.extra)}</td>
          </tr>
        `).join('')}
      </table>`;
  const modeButton = `<button class="btn btn-primary mode-btn">${isEditMode ? '閲覧モード' : '編集モード'}</button>`;
  const deleteButton = `<button class="btn btn-danger delete-btn">フォルダ削除</button>`;
  const addButton = isEditMode ? `<button class="btn btn-primary add-btn">新規単語</button>` : '';
  const addToFolderButton = isEditMode ? `<button class="btn btn-primary add-to-folder-btn">フォルダに追加</button>` : '';
  detailEl.innerHTML = `
    <div class="card">
      ${head}
      ${recipe}
      <div style="display:flex;gap:8px;margin:10px 0;">${modeButton} ${deleteButton} ${addButton} ${addToFolderButton}</div>
      <div style="margin-top:10px;">${rows}</div>
      <div class="muted" style="margin-top:8px;">※ ${isEditMode ? '入力で編集、各項目の右で再生成、新規単語で追加' : '編集モードで変更、カードをタップで解答/補足を切り替え'}</div>
    </div>`;

  // 編集モードのハンドラ
  if (isEditMode) {
    // 見出し編集ハンドラ
    const titleIn = detailEl.querySelector('input[data-title]');
    if (titleIn) {
      titleIn.addEventListener('input', () => {
        deck.title = titleIn.value;
        saveDecks();
        showToast('タイトルを更新しました');
      });
    }
    // レシピ編集ハンドラ
    const topicIn = detailEl.querySelector('input[data-topic]');
    const backKindIn = detailEl.querySelector('input[data-backKind]');
    const extraKindIn = detailEl.querySelector('input[data-extraKind]');
    const requestIn = detailEl.querySelector('input[data-request]');
    if (topicIn) {
      topicIn.addEventListener('input', () => {
        deck.meta.topic = topicIn.value;
        saveDecks();
        showToast('お題を更新しました');
      });
    }
    if (backKindIn) {
      backKindIn.addEventListener('input', () => {
        deck.meta.backKind = backKindIn.value;
        saveDecks();
        showToast('裏面を更新しました');
      });
    }
    if (extraKindIn) {
      extraKindIn.addEventListener('input', () => {
        deck.meta.extraKind = extraKindIn.value;
        saveDecks();
        showToast('補足を更新しました');
      });
    }
    if (requestIn) {
      requestIn.addEventListener('input', () => {
        deck.meta.request = requestIn.value;
        saveDecks();
        showToast('要望を更新しました');
      });
    }
    // カード入力と再生成ボタンのハンドラ
    detailEl.querySelectorAll('tr[data-card-index]').forEach((cardEl, i) => {
      const frontIn = cardEl.querySelector('input[data-front]');
      const backIn = cardEl.querySelector('textarea[data-back]');
      const extraIn = cardEl.querySelector('textarea[data-extra]');
      const regenFrontBtn = cardEl.querySelector('.regen-front');
      const regenBackBtn = cardEl.querySelector('.regen-back');
      const regenExtraBtn = cardEl.querySelector('.regen-extra');
      const deleteBtn = cardEl.querySelector('.delete-btn-card');
      if (!frontIn || !backIn || !extraIn || !regenFrontBtn || !regenBackBtn || !regenExtraBtn || !deleteBtn) {
        console.error('Input or button elements not found for card:', { index: i });
        return;
      }
      frontIn.addEventListener('input', () => {
        deck.cards[i].front = frontIn.value;
        saveDecks();
        showToast('単語を更新しました');
      });
      backIn.addEventListener('input', () => {
        deck.cards[i].back = backIn.value;
        saveDecks();
        showToast('説明を更新しました');
      });
      extraIn.addEventListener('input', () => {
        deck.cards[i].extra = extraIn.value;
        saveDecks();
        showToast('補足を更新しました');
      });
      regenFrontBtn.addEventListener('click', async () => {
        console.log('Regen front clicked:', { index: i, deckId: deck.id });
        try {
          const existingTerms = deck.cards.map(card => card.front);
          const res = await fetch('/api/regen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...deck.meta, target: 'all', existingTerms })
          });
          const { card, error } = await res.json();
          if (error) throw new Error(error);
          deck.cards[i] = card;
          deck.lastUsed = fmtNow();
          saveDecks();
          renderDeckDetail(deck);
          showToast('単語を再生成しました');
        } catch (e) {
          console.error('Regen failed:', e);
          showToast('再生成に失敗しました: サーバーエラーが発生しました');
        }
      });
      regenBackBtn.addEventListener('click', async () => {
        console.log('Regen back clicked:', { index: i, deckId: deck.id, front: deck.cards[i].front, extra: deck.cards[i].extra });
        try {
          const existingTerms = deck.cards.map(card => card.front);
          const res = await fetch('/api/regen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...deck.meta,
              front: deck.cards[i].front,
              back: deck.cards[i].back,
              extra: deck.cards[i].extra,
              target: 'back',
              existingTerms
            })
          });
          const { card, error } = await res.json();
          if (error) throw new Error(error);
          deck.cards[i] = card;
          deck.lastUsed = fmtNow();
          saveDecks();
          renderDeckDetail(deck);
          showToast('説明を再生成しました');
        } catch (e) {
          console.error('Regen failed:', e);
          showToast('説明の再生成に失敗しました: サーバーエラーが発生しました');
        }
      });
      regenExtraBtn.addEventListener('click', async () => {
        console.log('Regen extra clicked:', { index: i, deckId: deck.id, front: deck.cards[i].front, back: deck.cards[i].back });
        try {
          const existingTerms = deck.cards.map(card => card.front);
          const res = await fetch('/api/regen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...deck.meta,
              front: deck.cards[i].front,
              back: deck.cards[i].back,
              extra: deck.cards[i].extra,
              target: 'extra',
              existingTerms
            })
          });
          const { card, error } = await res.json();
          if (error) throw new Error(error);
          deck.cards[i] = card;
          deck.lastUsed = fmtNow();
          saveDecks();
          renderDeckDetail(deck);
          showToast('補足を再生成しました');
        } catch (e) {
          console.error('Regen failed:', e);
          showToast('補足の再生成に失敗しました: サーバーエラーが発生しました');
        }
      });
      deleteBtn.addEventListener('click', () => {
        if (confirm('この単語を削除しますか？')) {
          deck.cards.splice(i, 1);
          deck.lastUsed = fmtNow();
          saveDecks();
          renderDeckDetail(deck);
          showToast('単語を削除しました');
        }
      });
    });
    const addBtn = detailEl.querySelector('.add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        deck.cards.unshift({ front: '', back: '', extra: '' });
        saveDecks();
        renderDeckDetail(deck);
        showToast('新規単語を追加しました');
      });
    }
    const addToFolderBtn = detailEl.querySelector('.add-to-folder-btn');
    if (addToFolderBtn) {
      addToFolderBtn.addEventListener('click', () => {
        openModal('folderAdd', deck.id);
      });
    }
  }
  // 非編集モードのカードハンドラ
  if (!isEditMode) {
    const cardEl = detailEl.querySelector('.preview-card');
    if (cardEl) {
      cardEl.addEventListener('click', () => {
        deck.cardViewMode = deck.cardViewMode === 'front' ? 'back' : 'front';
        saveDecks();
        renderDeckDetail(deck);
      });
      const toggleExtraBtn = cardEl.querySelector('.toggle-extra');
      if (toggleExtraBtn) {
        toggleExtraBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deck.cardViewMode = deck.cardViewMode === 'extra' ? 'front' : 'extra';
          saveDecks();
          renderDeckDetail(deck);
        });
      }
      // スワイプ検知
      let startX = null;
      cardEl.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
      }, { passive: true });
      cardEl.addEventListener('touchmove', e => {
        if (startX === null) return;
        e.preventDefault(); // 上下スクロール防止
        const dx = e.touches[0].clientX - startX;
        cardEl.style.transform = `translateX(${Math.max(-100, Math.min(100, dx))}px)`;
      }, { passive: false }); // passive: false で preventDefault を有効化
      cardEl.addEventListener('touchend', () => {
        const t = parseInt(cardEl.style.transform.replace(/[^\-0-9]/g, '')) || 0;
        if (t > 30 && currentCardIndex > 0) {
          deck.currentCardIndex = currentCardIndex - 1;
          deck.cardViewMode = 'front';
          saveDecks();
          renderDeckDetail(deck);
        } else if (t < -30 && currentCardIndex < deck.cards.length - 1) {
          deck.currentCardIndex = currentCardIndex + 1;
          deck.cardViewMode = 'front';
          saveDecks();
          renderDeckDetail(deck);
        }
        cardEl.style.transform = 'translateX(0)';
        startX = null;
      });
    }
    const prevBtn = detailEl.querySelector('.prev-card');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        deck.currentCardIndex = Math.max(0, (deck.currentCardIndex || 0) - 1);
        deck.cardViewMode = 'front';
        saveDecks();
        renderDeckDetail(deck);
      });
    }
    const nextBtn = detailEl.querySelector('.next-card');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        deck.currentCardIndex = Math.min(deck.cards.length - 1, (deck.currentCardIndex || 0) + 1);
        deck.cardViewMode = 'front';
        saveDecks();
        renderDeckDetail(deck);
      });
    }
    const studyBtn = detailEl.querySelector('.study-btn');
    if (studyBtn) {
      studyBtn.addEventListener('click', () => {
        console.log('Study mode started:', { deckId: deck.id });
        deck.progress = deck.progress || { correct: 0, total: 0 };
        deck.currentCardIndex = 0;
        deck.cardViewMode = 'front';
        saveDecks();
        go(`#/study/${deck.id}`);
      });
    }
    const slider = detailEl.querySelector('.card-slider');
    if (slider) {
      // スライド中のリアルタイム表示
      slider.addEventListener('input', () => {
        const value = parseInt(slider.value) + 1;
        const total = deck.cards.length;
        const sliderValue = detailEl.querySelector('.card-slider-value');
        if (sliderValue) {
          sliderValue.textContent = `${value}/${total}`;
        }
      });
      // スライド完了時にカード更新
      slider.addEventListener('change', () => {
        deck.currentCardIndex = parseInt(slider.value);
        deck.cardViewMode = 'front';
        saveDecks();
        renderDeckDetail(deck);
      });
    }
  }
  const modeBtn = detailEl.querySelector('.mode-btn');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      console.log('Mode button clicked, toggling isEditMode from:', deck.isEditMode);
      deck.isEditMode = !deck.isEditMode;
      saveDecks();
      renderDeckDetail(deck);
    });
  } else {
    console.error('Mode button not found');
  }
  const deleteBtn = detailEl.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      console.log('Delete button clicked for deck:', deck.id);
      if (confirm('この単語帳を削除しますか？')) {
        decks.delete(deck.id);
        saveDecks();
        showToast('単語帳を削除しました');
        go('#/home');
      }
    });
  } else {
    console.error('Delete button not found');
  }
}

function renderStudyMode(deck) {
  const studyEl = document.getElementById('study');
  // 暗記モード用のカードリストをセッションごとに保持
  if (!deck._studyCards) {
    deck._studyCards = [...deck.cards];
    deck.currentCardIndex = 0;
    deck.cardViewMode = 'front';
  }
  const studyCards = deck._studyCards;
  const currentCardIndex = deck.currentCardIndex || 0;
  const cardViewMode = deck.cardViewMode || 'front';
  if (studyCards.length === 0) {
    delete deck._studyCards;
    go(`#/deck/${deck.id}`);
    showToast('すべてのカードを学習しました');
    return;
  }
  studyEl.innerHTML = `
    <div class="card-nav">
      <span>${currentCardIndex + 1}/${studyCards.length}</span>
    </div>
    <div class="preview-card" data-card-index="${currentCardIndex}">
      <div class="card-face ${cardViewMode}">
        ${cardViewMode === 'front' ? escapeHTML(studyCards[currentCardIndex]?.front || '') :
          cardViewMode === 'back' ? escapeHTML(studyCards[currentCardIndex]?.back || '') :
          escapeHTML(studyCards[currentCardIndex]?.extra || '')}
      </div>
      ${cardViewMode !== 'extra' ? `<button class="btn toggle-extra" style="position:absolute;bottom:10px;right:10px;">補足</button>` : ''}
    </div>
    <div style="display:flex;gap:8px;margin:10px 0;justify-content:space-between;">
      <button class="btn btn-danger dont-know-btn" style="order:1;flex:1;">知らない</button>
      <button class="btn exit-btn" style="order:2;flex:0 0 auto;">終了</button>
      <button class="btn btn-primary know-btn" style="order:3;flex:1;">知ってる</button>
    </div>
    <div style="text-align: center; color: #cbd5e1; margin-top: 10px;">
      <span>残り: ${studyCards.length}枚</span>
    </div>`;
  const studyCard = studyEl.querySelector('.preview-card');
  if (studyCard) {
    studyCard.addEventListener('click', () => {
      deck.cardViewMode = deck.cardViewMode === 'front' ? 'back' : 'front';
      saveDecks();
      renderStudyMode(deck);
    });
    const toggleExtraBtn = studyCard.querySelector('.toggle-extra');
    if (toggleExtraBtn) {
      toggleExtraBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deck.cardViewMode = deck.cardViewMode === 'extra' ? 'front' : 'extra';
        saveDecks();
        renderStudyMode(deck);
      });
    }
    // スワイプ検知（暗記モード）
    let startX = null;
    studyCard.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
    }, { passive: true });
    studyCard.addEventListener('touchmove', e => {
      if (startX === null) return;
      e.preventDefault(); // 上下スクロール防止
      const dx = e.touches[0].clientX - startX;
      studyCard.style.transform = `translateX(${Math.max(-100, Math.min(100, dx))}px)`;
    }, { passive: false }); // passive: false で preventDefault を有効化
    studyCard.addEventListener('touchend', () => {
      const t = parseInt(studyCard.style.transform.replace(/[^\-0-9]/g, '')) || 0;
      if (t > 30 && studyCards.length > 0) {
        deck.progress.correct = (deck.progress.correct || 0) + 1;
        deck.progress.total = (deck.progress.total || 0) + 1;
        studyCards.splice(currentCardIndex, 1); // 知ってる：コピーからカード削除
        deck.currentCardIndex = Math.min(studyCards.length - 1, currentCardIndex);
        deck.cardViewMode = 'front';
        deck.lastUsed = fmtNow();
        saveDecks();
        renderStudyMode(deck);
      } else if (t < -30 && studyCards.length > 0) {
        const card = studyCards.splice(currentCardIndex, 1)[0]; // 知らない：コピー内で最後尾に
        studyCards.push(card);
        deck.progress.total = (deck.progress.total || 0) + 1;
        deck.currentCardIndex = Math.min(studyCards.length - 1, currentCardIndex);
        deck.cardViewMode = 'front';
        deck.lastUsed = fmtNow();
        saveDecks();
        renderStudyMode(deck);
      }
      studyCard.style.transform = 'translateX(0)';
      startX = null;
    });
  }
  const knowBtn = studyEl.querySelector('.know-btn');
  if (knowBtn) {
    knowBtn.addEventListener('click', () => {
      console.log('Know clicked:', { index: deck.currentCardIndex });
      deck.progress.correct = (deck.progress.correct || 0) + 1;
      deck.progress.total = (deck.progress.total || 0) + 1;
      studyCards.splice(currentCardIndex, 1); // 知ってる：コピーからカード削除
      deck.currentCardIndex = Math.min(studyCards.length - 1, currentCardIndex);
      deck.cardViewMode = 'front';
      deck.lastUsed = fmtNow();
      saveDecks();
      renderStudyMode(deck);
    });
  }
  const dontKnowBtn = studyEl.querySelector('.dont-know-btn');
  if (dontKnowBtn) {
    dontKnowBtn.addEventListener('click', () => {
      console.log('Dont know clicked:', { index: deck.currentCardIndex });
      const card = studyCards.splice(currentCardIndex, 1)[0]; // 知らない：コピー内で最後尾に
      studyCards.push(card);
      deck.progress.total = (deck.progress.total || 0) + 1;
      deck.currentCardIndex = Math.min(studyCards.length - 1, currentCardIndex);
      deck.cardViewMode = 'front';
      deck.lastUsed = fmtNow();
      saveDecks();
      renderStudyMode(deck);
    });
  }
  const exitBtn = studyEl.querySelector('.exit-btn');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      console.log('Study mode exited:', { deckId: deck.id, progress: deck.progress });
      deck.currentCardIndex = Math.min(studyCards.length, deck.cards.length - 1); // 最後の有効なインデックスを保持
      delete deck._studyCards;
      deck.lastUsed = fmtNow();
      saveDecks();
      go(`#/deck/${deck.id}`);
    });
  }
}

function go(hash) {
  if (location.hash === hash) {
    route();
  } else {
    location.hash = hash;
  }
}

function route() {
  console.log('Routing to:', location.hash);
  const deckMatch = location.hash.match(/^#\/deck\/(.+)$/);
  const studyMatch = location.hash.match(/^#\/study\/(.+)$/);
  const foldersMatch = location.hash === '#/folders';
  const homeView = document.getElementById('homeView');
  const deckView = document.getElementById('deckView');
  const studyView = document.getElementById('studyView');
  const folderView = document.getElementById('folderView');
  const bottomNav = document.getElementById('bottomNav');
  homeView.hidden = true;
  deckView.hidden = true;
  studyView.hidden = true;
  folderView.hidden = true;
  bottomNav.hidden = true;
  if (deckMatch) {
    deckView.hidden = false;
    const id = deckMatch[1];
    let deck = decks.get(id);
    if (!deck) {
      deck = { id, title: '(読み込み中…)', meta: { topic: '', backKind: '', extraKind: '', request: '', count: 0 }, cards: [], lastUsed: '' };
      decks.set(id, deck);
      console.warn('Deck not found, created placeholder:', id);
    }
    renderDeckDetail(deck);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (studyMatch) {
    studyView.hidden = false;
    const id = studyMatch[1];
    let deck = decks.get(id);
    if (!deck) {
      deck = { id, title: '(読み込み中…)', meta: { topic: '', backKind: '', extraKind: '', request: '', count: 0 }, cards: [], lastUsed: '' };
      decks.set(id, deck);
      console.warn('Deck not found, created placeholder:', id);
    }
    renderStudyMode(deck);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (foldersMatch) {
    folderView.hidden = false;
    bottomNav.hidden = false;
    setActiveNav('folders');
    renderFolderView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    homeView.hidden = false;
    renderHistory();
    bottomNav.hidden = false;
    setActiveNav('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function setActiveNav(page) {
  const navButtons = document.querySelectorAll('.bottom-nav button');
  navButtons.forEach(btn => {
    if (btn.dataset.page === page) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

window.addEventListener('hashchange', route);

// スクロールをロック/解除するシンプルな関数
function lockScroll(lock) {
  if (lock) {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  } else {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }
}

// ユーティリティ
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[m]); }
function escapeAttr(s) { return escapeHTML(s).replace(/"/g, '&quot;'); }
function fmtNow() {
  const d = new Date();
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

// openModal を更新（モード対応）
function openModal(mode = 'generate', deckId = null) {
  const sheet = document.getElementById('sheet');
  const generateForm = document.getElementById('generateForm');
  const folderAddForm = document.getElementById('folderAddForm');
  generateForm.style.display = mode === 'generate' ? 'block' : 'none';
  folderAddForm.style.display = mode === 'folderAdd' ? 'block' : 'none';
  if (mode === 'folderAdd') {
    const folderSelect = document.getElementById('folderSelect');
    folderSelect.innerHTML = '';
    if (folders.length === 0) {
      document.getElementById('noFolders').style.display = 'block';
      document.getElementById('addToFolderBtn').disabled = true;
    } else {
      document.getElementById('noFolders').style.display = 'none';
      document.getElementById('addToFolderBtn').disabled = false;
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        folderSelect.appendChild(option);
      });
    }
    folderAddForm.dataset.deckId = deckId; // 選択中のdeck.idを保存
  }
  sheet.classList.add('open');
  document.getElementById('overlay').classList.add('open');
  lockScroll(true);
}

// closeModal を更新（フォームリセット）
function closeModal() {
  const sheet = document.getElementById('sheet');
  const generateForm = document.getElementById('generateForm');
  const folderAddForm = document.getElementById('folderAddForm');
  sheet.classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  generateForm.style.display = 'block';
  folderAddForm.style.display = 'none';
  document.getElementById('topic').value = '';
  document.getElementById('backKind').value = '任意';
  document.getElementById('extraKind').value = '任意';
  document.getElementById('request').value = '';
  document.getElementById('count').value = '5';
  document.getElementById('count-value').textContent = '5';
  document.getElementById('backKind-custom').value = '';
  document.getElementById('extraKind-custom').value = '';
  document.getElementById('backKind-custom').style.display = 'block';
  document.getElementById('extraKind-custom').style.display = 'block';
  sheet.style.transform = '';
  lockScroll(false);
}

async function generateDeck() {
  const topic = document.getElementById('topic').value.trim();
  const backKindValue = document.getElementById('backKind').value.trim();
  const extraKindValue = document.getElementById('extraKind').value.trim();
  const backKind = backKindValue === '任意' ? document.getElementById('backKind-custom').value.trim() : backKindValue;
  const extraKind = extraKindValue === '任意' ? document.getElementById('extraKind-custom').value.trim() : extraKindValue;
  const request = document.getElementById('request').value.trim();
  const count = parseInt(document.getElementById('count').value) || 5;

  if (!topic) {
    showToast('お題を入力してください');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, backKind, extraKind, request, count })
    });
    if (!res.ok) {
      if (navigator.onLine === false) {
        showToast('オフラインです。既存の単語帳をご利用ください。');
        return;
      }
      throw new Error(`API error: ${res.status}`);
    }
    const { cards, error } = await res.json();
    if (error) throw new Error(error);
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      showToast('生成された単語がありません');
      return;
    }

    const deckId = uid();
    const deck = {
      id: deckId,
      title: topic,
      meta: { topic, backKind, extraKind, request, count },
      cards,
      lastUsed: fmtNow()
    };
    decks.set(deckId, deck);
    saveDecks();
    showToast('単語帳を生成しました');
    go(`#/deck/${deckId}`);
    closeModal();
  } catch (e) {
    console.error('Generate failed:', e);
    showToast('生成に失敗しました: ' + (navigator.onLine ? String(e) : 'オフラインです'));
  }
}

// regenDeck関数を追加しAPI_BASE利用＆オフライン判定
async function regenDeck({ topic, backKind, extraKind, request, front, target, back, extra, existingTerms }) {
  try {
    const res = await fetch(`${API_BASE}/api/regen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, backKind, extraKind, request, front, target, back, extra, existingTerms })
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const { card, error } = await res.json();
    if (error) throw new Error(error);
    return card;
  } catch (e) {
    console.error('RegenDeck failed:', e);
    throw e;
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000); // 3秒後に消える
  } else {
    console.warn('Toast element not found:', message);
  }
}