import React, { useState } from 'react';
import { parseDateTime, formatDateTime } from '../utils/dateTimeParser';

export const DateTimeTest: React.FC = () => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<any>(null);

  const testCases = [
    '1/27/2026',
    '27/01/2026',
    '2026-01-27',
    '1',
    '2',
    'Slot 3',
    'slot4',
    '13h00-14h30',
    '13:00-14:30',
    '7h00 - 9h15',
    '1:00 PM - 2:30 PM',
  ];

  const handleTest = (value: string) => {
    const parsed = parseDateTime(value);
    setResult({
      input: value,
      parsed,
      formatted: formatDateTime(parsed)
    });
  };

  return (
    <div className="datetime-test">
      <h3>Test DateTime Parser</h3>
      
      <div className="test-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập date/time để test..."
          className="test-input-field"
        />
        <button onClick={() => handleTest(input)} className="btn-test">Test</button>
      </div>

      <div className="test-cases">
        <h4>Quick Tests:</h4>
        <div className="case-buttons">
          {testCases.map((tc, idx) => (
            <button key={idx} onClick={() => handleTest(tc)} className="test-case-btn">
              {tc}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="result">
          <h4>Result:</h4>
          <div className="result-content">
            <div className="result-row">
              <span className="label">Input:</span>
              <span className="value">{result.input}</span>
            </div>
            <div className="result-row">
              <span className="label">Type:</span>
              <span className="value">{result.parsed.type}</span>
            </div>
            <div className="result-row">
              <span className="label">Formatted:</span>
              <span className="value">{result.formatted}</span>
            </div>
            {result.parsed.dateString && (
              <div className="result-row">
                <span className="label">ISO Date:</span>
                <span className="value">{result.parsed.dateString}</span>
              </div>
            )}
            {result.parsed.timeSlot && (
              <>
                <div className="result-row">
                  <span className="label">Time Start:</span>
                  <span className="value">{result.parsed.timeSlot.startTime}</span>
                </div>
                <div className="result-row">
                  <span className="label">Time End:</span>
                  <span className="value">{result.parsed.timeSlot.endTime}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
