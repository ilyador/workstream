import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseActions } from './bot-action-parser.js';

describe('bot-action-parser', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns an empty action list and untouched text when there are no ACTION lines', () => {
    const result = parseActions('Here is just some text.\nAnother line.');
    expect(result).toEqual({ text: 'Here is just some text.\nAnother line.', actions: [] });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('parses a single action line and strips it from the returned text', () => {
    const response = 'Sure, I will do that.\nACTION: create_task {"title":"Ship it","type":"feature"}';
    const result = parseActions(response);
    expect(result.text).toBe('Sure, I will do that.');
    expect(result.actions).toEqual([
      { name: 'create_task', params: { title: 'Ship it', type: 'feature' } },
    ]);
  });

  it('parses multiple action lines interleaved with text', () => {
    const response = [
      'I will take two steps here.',
      'ACTION: create_task {"title":"A"}',
      'Then update another task.',
      'ACTION: update_task {"task_id":"t-1","status":"done"}',
    ].join('\n');
    const result = parseActions(response);
    expect(result.text).toBe('I will take two steps here.\nThen update another task.');
    expect(result.actions).toEqual([
      { name: 'create_task', params: { title: 'A' } },
      { name: 'update_task', params: { task_id: 't-1', status: 'done' } },
    ]);
  });

  it('preserves nested objects in action params', () => {
    const response = 'ACTION: create_task {"title":"A","meta":{"priority":1,"tags":["x","y"]}}';
    const result = parseActions(response);
    expect(result.actions[0]).toEqual({
      name: 'create_task',
      params: { title: 'A', meta: { priority: 1, tags: ['x', 'y'] } },
    });
  });

  it('drops ACTION lines with invalid JSON into the text output and warns', () => {
    const response = 'ACTION: create_task {broken json}';
    const result = parseActions(response);
    expect(result.actions).toEqual([]);
    expect(result.text).toBe('ACTION: create_task {broken json}');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
  });

  it('drops ACTION lines whose JSON parses to null and warns', () => {
    const response = 'ACTION: create_task null';
    const result = parseActions(response);
    expect(result.actions).toEqual([]);
    expect(result.text).toBe('ACTION: create_task null');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a JSON object'));
  });

  it('drops ACTION lines whose JSON parses to a primitive and warns', () => {
    for (const payload of ['42', '"hello"', 'true', 'false']) {
      warnSpy.mockClear();
      const result = parseActions(`ACTION: create_task ${payload}`);
      expect(result.actions).toEqual([]);
      expect(result.text).toBe(`ACTION: create_task ${payload}`);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a JSON object'));
    }
  });

  it('drops ACTION lines whose JSON parses to an array and warns', () => {
    const result = parseActions('ACTION: create_task ["not","an","object"]');
    expect(result.actions).toEqual([]);
    expect(result.text).toBe('ACTION: create_task ["not","an","object"]');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a JSON object'));
  });

  it('leaves lines that do not match the ACTION prefix untouched', () => {
    const response = 'This mentions ACTION: but is not formatted.';
    const result = parseActions(response);
    expect(result.actions).toEqual([]);
    expect(result.text).toBe('This mentions ACTION: but is not formatted.');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('is case-sensitive on the ACTION prefix', () => {
    const result = parseActions('action: create_task {"title":"A"}');
    expect(result.actions).toEqual([]);
    expect(result.text).toBe('action: create_task {"title":"A"}');
  });

  it('requires whitespace before the params — indented ACTION lines are not matched', () => {
    const result = parseActions('    ACTION: create_task {"title":"A"}');
    expect(result.actions).toEqual([]);
    expect(result.text).toBe('ACTION: create_task {"title":"A"}');
  });

  it('accepts empty object params', () => {
    const result = parseActions('ACTION: noop {}');
    expect(result.actions).toEqual([{ name: 'noop', params: {} }]);
    expect(result.text).toBe('');
  });

  it('trims leading and trailing whitespace from the assembled text', () => {
    const response = '\n\nSome text.\n\nACTION: create_task {"title":"A"}\n\n';
    const result = parseActions(response);
    expect(result.text).toBe('Some text.');
    expect(result.actions).toHaveLength(1);
  });
});
