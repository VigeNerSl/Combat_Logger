# Combat Logger: API для других аддонов

Связь идёт через `/scriptevent` и `system.sendScriptEvent`: это штатный канал между паками, импортировать модули
Combat Logger не нужно. Проверено на BDS 1.26.63.1: событие из одного пака доходит до обработчиков другого в обе стороны.
Id событий лежат в `config.js` → `general.scriptEvents`. Это контракт: если их переименовать, чужие аддоны перестанут работать.

## Теги

| Тег | Что значит |
|---|---|
| `combatlog` | Игрок сейчас в бою. Читается через `player.hasTag("combatlog")` и селектором `@a[tag=combatlog]`. |
| `nocombat` | Игрок не попадает в бой ни от ударов, ни от `combat_enter`. Подходит для лобби, спавна и ивент-зон. |

Имена тегов задаются в `config.js` (`general.combatTag`, `general.bypassTag`).

## Команды аддону

У каждой команды цель выбирается одним из трёх способов:

1. Пустое сообщение: целью становится тот, от чьего имени выполнена команда. Пример:
   `execute as @a[tag=arena] run scriptevent vigenersl:combat_enter`.
2. Текст: ник игрока или его `id`. Пример: `scriptevent vigenersl:combat_enter Steve`.
3. JSON с полями `player`, `opponent` и `requestId`. В `player` и `opponent` можно передать ник или `id`. Без `player`
   целью становится тот, от чьего имени выполнена команда. Пример:
   `system.sendScriptEvent("vigenersl:combat_enter", JSON.stringify({ player: a.id, opponent: b.id }))`.

Если игрок не найден, команда ничего не делает и пишет предупреждение в лог сервера. Исключение — `combat_query`:
на него приходит ответ с ошибкой (см. ниже).

### `vigenersl:combat_enter`

Вводит игрока в бой на `combatSeconds` секунд из настроек. Если игрок уже в бою, таймер продлевается.

- Без `opponent` противником в логе пишется `/scriptevent` (`config.ui.forcedOpponent`).
- С `opponent` в бой входят оба, каждый против другого. Так можно, например, свести двух игроков на арене.
  Если `opponent` не найден, не входит никто.
- Команда ничего не делает, если аддон выключен, если игрок или противник исключён (тег `nocombat`, креатив или
  наблюдатель, оператор при включённой настройке) или если `opponent` — тот же игрок.

### `vigenersl:combat_leave`

Снимает бой и тег без наказания. Отвечает событием `combat_ended` с причиной `command`.

### `vigenersl:combat_query`

Спрашивает состояние игрока. Ответ приходит событием `vigenersl:combat_state`. Если в запросе был `requestId`,
он возвращается в ответе: по нему ответ можно сопоставить с запросом, даже когда спрашивают сразу несколько аддонов.

```json
{"requestId":"r1","playerId":"-4294967295","isInCombat":true,"secondsLeft":23,"opponents":["Alex"]}
```

`isInCombat` совпадает с тегом `combatlog` и событиями: `true` от `combat_started` до `combat_ended`. Когда таймер уже
истёк, а `combat_ended` ещё не отправлен (до полсекунды), ответ — `"isInCombat":true,"secondsLeft":0`.

Если игрок не найден: `{"requestId":"r1","error":"playerNotFound","player":"Steve"}`.

## Что аддон сообщает сам

Сообщение каждого события — это JSON. Поля могут добавляться в будущих версиях, поэтому незнакомые поля нужно
пропускать.

### `vigenersl:combat_started`

Приходит, когда игрок **входит** в бой. Удар по тому, кто уже в бою, этого события не вызывает.

```json
{"playerId":"-4294967295","reason":"hit","opponentId":"-8589934591"}
```

| `reason` | Когда |
|---|---|
| `hit` | Удар игрока по игроку. |
| `command` | `combat_enter`. Поля `opponentId` нет, если противник не указан. |

### `vigenersl:combat_ended`

Приходит при **любом** выходе из боя. На каждый `combat_started` приходит ровно один `combat_ended`.

```json
{"playerId":"-4294967295","reason":"death","cause":"entityAttack","killerId":"-8589934591","killerTypeId":"minecraft:player"}
```

| `reason` | Когда |
|---|---|
| `timeout` | Истёк таймер боя. |
| `death` | Смерть в бою. Поле `cause` берётся из `EntityDamageCause`. `killerId` и `killerTypeId` есть, только если есть убийца; у стрелы это стрелок. |
| `logout` | Выход с сервера в бою. Наказание при этом работает как обычно. |
| `command` | `combat_leave`. |
| `exempt` | Игрок стал исключённым: получил тег `nocombat`, перешёл в креатив или стал оператором. |
| `disabled` | Аддон выключили в настройках. |

Бой хранится в памяти. После `/reload` и рестарта сервера все аддоны перезапускаются, бой сбрасывается, и
`combat_ended` не приходит.

## Пример: свой аддон

```js
import { system, world } from "@minecraft/server";

system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
	if (id === "vigenersl:combat_started") {
		const { playerId } = JSON.parse(message);
		world.getEntity(playerId)?.sendMessage("Ты в бою: телепорт недоступен");
	}

	if (id === "vigenersl:combat_ended") {
		const { playerId, reason } = JSON.parse(message);
		console.warn(`${playerId} вышел из боя: ${reason}`);
	}
});

// Ввести в бой при входе в ивент-зону:
system.sendScriptEvent("vigenersl:combat_enter", JSON.stringify({ player: player.id }));
```
