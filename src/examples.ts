// require-tx-shadowing ルールの動作確認用サンプル
//
// npm run lint   → エラー検出
// npm run write  → 自動修正

// ─── 型定義（簡易） ────────────────────────────────────────────────────────

interface UserRepo {
	update: (data: unknown) => Promise<void>;
	findById: (id: number) => Promise<unknown>;
}

interface PostRepo {
	update: (data: unknown) => Promise<void>;
	findMany: () => Promise<unknown[]>;
}

interface Tx {
	user: UserRepo;
	post: PostRepo;
}

declare const db: {
	transaction: <T>(cb: (tx: Tx) => Promise<T>) => Promise<T>;
};

// ─── OK: 外側の tx を正しくシャドーイングしている ─────────────────────────

// 型注釈あり
async function updateUserWithPost(tx: Tx) {
	await db.transaction(async (tx: Tx) => {
		await tx.user.update({ id: 1 });
		await tx.post.update({ userId: 1 });
	});
}

// 型注釈なし
async function findUserPosts(tx: Tx) {
	return db.transaction(async (tx) => {
		return tx.post.findMany();
	});
}

// ─── OK: 外側に tx がないので別名でも問題なし ─────────────────────────────

async function createUser() {
	await db.transaction(async (tx: Tx) => {
		await tx.user.update({ name: "Alice" });
	});
}

// ─── NG: 外側の tx が見えたままになっている ───────────────────────────────
// npm run write で以下がすべて自動修正される

async function ngInnerTx(tx: Tx) {
	// innerTx → tx に自動修正される
	await db.transaction(async (innerTx: Tx) => {
		await innerTx.user.update({ id: 1 });
	});
}

async function ngShortName(tx: Tx) {
	// t → tx に自動修正される
	await db.transaction(async (t: Tx) => {
		await t.post.findMany();
	});
}

async function ngNoAnnotation(tx: Tx) {
	// dbTx → tx に自動修正される
	await db.transaction(async (dbTx) => {
		await dbTx.user.update({ id: 2 });
	});
}
