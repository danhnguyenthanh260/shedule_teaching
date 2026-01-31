import React from 'react';
import { NormalizedSheet } from '../utils/excelParser';

interface DataTableProps {
  data: NormalizedSheet;
}

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  if (!data || data.data.length === 0) {
    return <div className="no-data">Chưa có dữ liệu</div>;
  }

  return (
    <div className="data-table-container">
      <div className="table-info">
        <h3>{data.sheetName}</h3>
        <p>{data.data.length} dòng × {data.headers.length} cột</p>
      </div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {data.headers.map((header, index) => (
                <th key={index}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {data.headers.map((header, colIndex) => (
                  <td key={colIndex}>{row[header]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
