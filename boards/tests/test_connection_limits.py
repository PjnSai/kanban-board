import asyncio

from boards.consumers import CONNECTION_LIMIT_CLOSE_CODE, ConnectionLimiter


class FakeConsumer:
    def __init__(self, fail_on_close=False):
        self.closed_with = None
        self.fail_on_close = fail_on_close

    async def close(self, code=None):
        if self.fail_on_close:
            raise RuntimeError('already closed')
        self.closed_with = code


def test_the_oldest_connection_is_closed_when_over_the_limit():
    limiter = ConnectionLimiter(2)
    first, second, third = FakeConsumer(), FakeConsumer(), FakeConsumer()

    async def run():
        await limiter.add(1, first)
        await limiter.add(1, second)
        await limiter.add(1, third)

    asyncio.run(run())
    assert first.closed_with == CONNECTION_LIMIT_CLOSE_CODE
    assert second.closed_with is None and third.closed_with is None
    assert limiter.count(1) == 2


def test_users_are_limited_independently():
    limiter = ConnectionLimiter(1)
    mine, theirs = FakeConsumer(), FakeConsumer()

    async def run():
        await limiter.add(1, mine)
        await limiter.add(2, theirs)

    asyncio.run(run())
    assert mine.closed_with is None and theirs.closed_with is None
    assert limiter.count(1) == 1 and limiter.count(2) == 1


def test_removing_frees_a_slot_and_is_safe_for_unknown_connections():
    limiter = ConnectionLimiter(1)
    first, second = FakeConsumer(), FakeConsumer()

    async def run():
        await limiter.add(1, first)
        limiter.remove(1, first)
        limiter.remove(1, FakeConsumer())   # never added: must not raise
        limiter.remove(99, FakeConsumer())  # unknown user: must not raise
        await limiter.add(1, second)

    asyncio.run(run())
    assert first.closed_with is None
    assert limiter.count(1) == 1


def test_a_failing_close_does_not_block_a_new_connection():
    limiter = ConnectionLimiter(1)
    broken, fresh = FakeConsumer(fail_on_close=True), FakeConsumer()

    async def run():
        await limiter.add(1, broken)
        await limiter.add(1, fresh)

    asyncio.run(run())
    assert limiter.count(1) == 1