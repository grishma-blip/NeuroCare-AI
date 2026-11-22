import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Search, ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './index';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  filterColumnId?: string;
  onRowClick?: (row: TData) => void;
  pageSize?: number;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Search records...',
  filterColumnId,
  onRowClick,
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-navy-300" />
          <input
            type="text"
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-navy-100 bg-white pl-9 pr-3 py-1.5 text-xs text-navy placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-powder/30 focus:border-powder transition-all"
          />
        </div>

        <div className="text-2xs text-navy-300 font-mono">
          Showing {table.getRowModel().rows.length} of {data.length} records
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-navy-100/60 overflow-hidden bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-navy-100 bg-lavender-50/50 text-left text-navy-400">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        className={`py-3 px-4 font-semibold select-none ${canSort ? 'cursor-pointer hover:bg-lavender-100/60 transition-colors' : ''}`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="text-navy-300">
                              {sortDirection === 'asc' ? (
                                <ChevronUp className="h-3.5 w-3.5 text-navy" />
                              ) : sortDirection === 'desc' ? (
                                <ChevronDown className="h-3.5 w-3.5 text-navy" />
                              ) : (
                                <ChevronsUpDown className="h-3 w-3 opacity-40" />
                              )}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-navy-50">
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-lavender-50/40' : 'hover:bg-lavender-50/20'}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-2.5 px-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="py-8 text-center text-xs text-navy-300">
                    No matching records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {table.getPageCount() > 1 && (
          <div className="px-4 py-2.5 border-t border-navy-50 flex items-center justify-between text-2xs text-navy-400 bg-navy-50/20">
            <div>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="px-2 py-1 h-7 text-xs"
              >
                <ChevronLeft className="h-3 w-3 mr-0.5" /> Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="px-2 py-1 h-7 text-xs"
              >
                Next <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

