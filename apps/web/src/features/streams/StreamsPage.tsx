import React from "react";

import type {
  Artist,
  Genre,
  StreamEncoding,
  StreamHlsPrecacheStatus,
  StreamStatus,
  StreamSummary,
  StreamTrackOption
} from "../../app/types";
import { StreamCreateCard } from "./StreamCreateCard";
import { StreamEditModal } from "./StreamEditModal";
import { StreamConnectionsModal } from "./StreamConnectionsModal";
import { StreamPlayerModal } from "./StreamPlayerModal";
import { StreamsList } from "./StreamsList";
import { StreamsToolbar, type StreamOnlineFilter, type StreamSort } from "./StreamsToolbar";

type NamedEntity = { id: number; name: string };
type BivariantHandler<T> = { bivarianceHack(value: T): void | Promise<unknown> }["bivarianceHack"];

type StreamsPageProps = {
  streams: StreamSummary[];
  streamsLoading: boolean;
  visibleStreams: StreamSummary[];

  // Toolbar
  streamSearchQuery: string;
  setStreamSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  streamOnlineFilter: StreamOnlineFilter;
  setStreamOnlineFilter: React.Dispatch<React.SetStateAction<StreamOnlineFilter>>;
  streamSort: StreamSort;
  setStreamSort: React.Dispatch<React.SetStateAction<StreamSort>>;
  downloadStreamsM3u: () => void;
  loadStreams: () => void;

  // Create route
  isStreamCreateRoute: boolean;
  streamName: string;
  setStreamName: React.Dispatch<React.SetStateAction<string>>;
  streamIcon: string;
  setStreamIcon: React.Dispatch<React.SetStateAction<string>>;
  streamEncoding: StreamEncoding;
  setStreamEncoding: React.Dispatch<React.SetStateAction<StreamEncoding>>;
  streamShuffle: boolean;
  setStreamShuffle: React.Dispatch<React.SetStateAction<boolean>>;
  streamPrecacheHls: boolean;
  setStreamPrecacheHls: React.Dispatch<React.SetStateAction<boolean>>;
  streamSource: "manual" | "artists" | "genres";
  setStreamSource: React.Dispatch<React.SetStateAction<"manual" | "artists" | "genres">>;

  streamTrackQuery: string;
  setStreamTrackQuery: React.Dispatch<React.SetStateAction<string>>;
  streamTrackLoading: boolean;
  streamTrackResults: StreamTrackOption[];
  addStreamTrack: (track: StreamTrackOption) => void;

  selectedStreamTracks: StreamTrackOption[];
  moveStreamTrack: (index: number, direction: number) => void;
  removeStreamTrack: (trackId: number) => void;

  streamArtistQuery: string;
  setStreamArtistQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredStreamArtists: Artist[];
  streamArtistIds: number[];
  toggleStreamArtist: (artistId: number) => void;

  streamGenreQuery: string;
  setStreamGenreQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredStreamGenres: Genre[];
  streamGenreIds: number[];
  toggleStreamGenre: (genreId: number) => void;

  isCreatingStream: boolean;
  createStream: () => void | Promise<unknown>;

  // Existing streams list UI
  expandedStreamIds: number[];
  toggleStreamExpanded: (streamId: number) => void;
  streamHlsPrecacheStatus: Record<number, StreamHlsPrecacheStatus>;
  streamMenuId: number | null;
  setStreamMenuId: React.Dispatch<React.SetStateAction<number | null>>;
  streamMenuRef: React.RefObject<HTMLDivElement>;
  toggleStreamMenu: (streamId: number) => void;
  editingStreamId: number | null;
  beginEditStream: (stream: StreamSummary) => void;
  cancelEditStream: () => void;
  restartingStreamIds: number[];
  rescanningStreamIds: number[];
  streamLiveUrl: (streamId: number) => string;
  streamCachedUrl: (streamId: number) => string;
  shareableStreamUrl: (streamId: number) => string;
  getResolutionSummary: (items: Array<{ video_width?: number | null; video_height?: number | null }>) => string;
  openStreamPlayer: (streamId: number) => void;
  runStreamAction: (streamId: number, action: "start" | "stop" | "reboot") => void | Promise<unknown>;
  rescanStream: (streamId: number) => void | Promise<unknown>;
  precacheStreamHls: (streamId: number) => void | Promise<unknown>;
  deleteStream: (streamId: number, streamName: string) => void;
  setConnectionsModalStreamId: React.Dispatch<React.SetStateAction<number | null>>;

  // Edit modal UI
  editingStreamName: string;
  setEditingStreamName: React.Dispatch<React.SetStateAction<string>>;
  editingStreamIcon: string;
  setEditingStreamIcon: React.Dispatch<React.SetStateAction<string>>;
  editingStreamEncoding: StreamEncoding;
  setEditingStreamEncoding: React.Dispatch<React.SetStateAction<StreamEncoding>>;
  editingStreamShuffle: boolean;
  setEditingStreamShuffle: React.Dispatch<React.SetStateAction<boolean>>;
  editingStreamRestartOnSave: boolean;
  setEditingStreamRestartOnSave: React.Dispatch<React.SetStateAction<boolean>>;
  editingStreamPrecacheHls: boolean;
  setEditingStreamPrecacheHls: React.Dispatch<React.SetStateAction<boolean>>;
  editingStreamStatus: StreamStatus;
  setEditingStreamStatus: React.Dispatch<React.SetStateAction<StreamStatus>>;
  editingStreamTab: "artists" | "tracks";
  setEditingStreamTab: React.Dispatch<React.SetStateAction<"artists" | "tracks">>;
  editingStreamArtistQuery: string;
  setEditingStreamArtistQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredEditingStreamArtists: Artist[];
  editingStreamArtistIds: number[];
  editingStreamArtistLoadingIds: number[];
  toggleEditingStreamArtist: BivariantHandler<NamedEntity>;
  editingStreamTrackQuery: string;
  setEditingStreamTrackQuery: React.Dispatch<React.SetStateAction<string>>;
  editingStreamTrackLoading: boolean;
  editingStreamTrackResults: StreamTrackOption[];
  addEditingStreamTrack: (track: StreamTrackOption) => void;
  editingStreamTracks: StreamTrackOption[];
  editingStreamSelectedIds: number[];
  handleEditingStreamTrackSelect: (
    event: React.MouseEvent<HTMLLIElement>,
    index: number,
    trackId: number
  ) => void;
  shuffleEditingStreamTracks: () => void;
  moveEditingStreamTrack: (index: number, direction: number, trackId: number) => void;
  moveEditingStreamTracksToEdge: (
    index: number,
    edge: "top" | "bottom",
    trackId: number
  ) => void;
  removeEditingStreamTrack: (trackId: number) => void;
  rescanEditingStream: () => void | Promise<unknown>;
  saveStreamEdits: () => void | Promise<unknown>;

  // Modals: connections + player
  connectionsModalStream: StreamSummary | null;
  playingStreamId: number | null;
  streamPlayerNotice: string | null;
  setStreamPlayerNotice: (value: string | null) => void;
  streamPlayerRef: React.RefObject<HTMLVideoElement>;
  closeStreamPlayer: () => void;
};

export const StreamsPage = ({
  streams,
  streamsLoading,
  visibleStreams,
  streamSearchQuery,
  setStreamSearchQuery,
  streamOnlineFilter,
  setStreamOnlineFilter,
  streamSort,
  setStreamSort,
  downloadStreamsM3u,
  loadStreams,
  isStreamCreateRoute,
  streamName,
  setStreamName,
  streamIcon,
  setStreamIcon,
  streamEncoding,
  setStreamEncoding,
  streamShuffle,
  setStreamShuffle,
  streamPrecacheHls,
  setStreamPrecacheHls,
  streamSource,
  setStreamSource,
  streamTrackQuery,
  setStreamTrackQuery,
  streamTrackLoading,
  streamTrackResults,
  addStreamTrack,
  selectedStreamTracks,
  moveStreamTrack,
  removeStreamTrack,
  streamArtistQuery,
  setStreamArtistQuery,
  filteredStreamArtists,
  streamArtistIds,
  toggleStreamArtist,
  streamGenreQuery,
  setStreamGenreQuery,
  filteredStreamGenres,
  streamGenreIds,
  toggleStreamGenre,
  isCreatingStream,
  createStream,
  expandedStreamIds,
  toggleStreamExpanded,
  streamHlsPrecacheStatus,
  streamMenuId,
  setStreamMenuId,
  streamMenuRef,
  toggleStreamMenu,
  editingStreamId,
  beginEditStream,
  cancelEditStream,
  restartingStreamIds,
  rescanningStreamIds,
  streamLiveUrl,
  streamCachedUrl,
  shareableStreamUrl,
  getResolutionSummary,
  openStreamPlayer,
  runStreamAction,
  rescanStream,
  precacheStreamHls,
  deleteStream,
  setConnectionsModalStreamId,
  editingStreamName,
  setEditingStreamName,
  editingStreamIcon,
  setEditingStreamIcon,
  editingStreamEncoding,
  setEditingStreamEncoding,
  editingStreamShuffle,
  setEditingStreamShuffle,
  editingStreamRestartOnSave,
  setEditingStreamRestartOnSave,
  editingStreamPrecacheHls,
  setEditingStreamPrecacheHls,
  editingStreamStatus,
  setEditingStreamStatus,
  editingStreamTab,
  setEditingStreamTab,
  editingStreamArtistQuery,
  setEditingStreamArtistQuery,
  filteredEditingStreamArtists,
  editingStreamArtistIds,
  editingStreamArtistLoadingIds,
  toggleEditingStreamArtist,
  editingStreamTrackQuery,
  setEditingStreamTrackQuery,
  editingStreamTrackLoading,
  editingStreamTrackResults,
  addEditingStreamTrack,
  editingStreamTracks,
  editingStreamSelectedIds,
  handleEditingStreamTrackSelect,
  shuffleEditingStreamTracks,
  moveEditingStreamTrack,
  moveEditingStreamTracksToEdge,
  removeEditingStreamTrack,
  rescanEditingStream,
  saveStreamEdits,
  connectionsModalStream,
  playingStreamId,
  streamPlayerNotice,
  setStreamPlayerNotice,
  streamPlayerRef,
  closeStreamPlayer
}: StreamsPageProps) => (
  <section className="space-y-4">
    <StreamsToolbar
      streamSearchQuery={streamSearchQuery}
      setStreamSearchQuery={setStreamSearchQuery}
      streamOnlineFilter={streamOnlineFilter}
      setStreamOnlineFilter={setStreamOnlineFilter}
      streamSort={streamSort}
      setStreamSort={setStreamSort}
      canDownloadM3u={streams.length > 0}
      onDownloadM3u={downloadStreamsM3u}
      onRefresh={loadStreams}
    />

    {isStreamCreateRoute && (
      <StreamCreateCard
        streamName={streamName}
        setStreamName={setStreamName}
        streamIcon={streamIcon}
        setStreamIcon={setStreamIcon}
        streamEncoding={streamEncoding}
        setStreamEncoding={setStreamEncoding}
        streamShuffle={streamShuffle}
        setStreamShuffle={setStreamShuffle}
        streamPrecacheHls={streamPrecacheHls}
        setStreamPrecacheHls={setStreamPrecacheHls}
        streamSource={streamSource}
        setStreamSource={setStreamSource}
        streamTrackQuery={streamTrackQuery}
        setStreamTrackQuery={setStreamTrackQuery}
        streamTrackLoading={streamTrackLoading}
        streamTrackResults={streamTrackResults}
        addStreamTrack={addStreamTrack}
        selectedStreamTracks={selectedStreamTracks}
        moveStreamTrack={moveStreamTrack}
        removeStreamTrack={removeStreamTrack}
        streamArtistQuery={streamArtistQuery}
        setStreamArtistQuery={setStreamArtistQuery}
        filteredStreamArtists={filteredStreamArtists}
        streamArtistIds={streamArtistIds}
        toggleStreamArtist={toggleStreamArtist}
        streamGenreQuery={streamGenreQuery}
        setStreamGenreQuery={setStreamGenreQuery}
        filteredStreamGenres={filteredStreamGenres}
        streamGenreIds={streamGenreIds}
        toggleStreamGenre={toggleStreamGenre}
        isCreatingStream={isCreatingStream}
        createStream={createStream}
      />
    )}

    {!isStreamCreateRoute && (
      <StreamsList
        streams={streams}
        visibleStreams={visibleStreams}
        streamsLoading={streamsLoading}
        expandedStreamIds={expandedStreamIds}
        toggleStreamExpanded={toggleStreamExpanded}
        streamHlsPrecacheStatus={streamHlsPrecacheStatus}
        streamMenuId={streamMenuId}
        setStreamMenuId={setStreamMenuId}
        streamMenuRef={streamMenuRef}
        toggleStreamMenu={toggleStreamMenu}
        editingStreamId={editingStreamId}
        beginEditStream={beginEditStream}
        cancelEditStream={cancelEditStream}
        restartingStreamIds={restartingStreamIds}
        rescanningStreamIds={rescanningStreamIds}
        streamLiveUrl={streamLiveUrl}
        streamCachedUrl={streamCachedUrl}
        shareableStreamUrl={shareableStreamUrl}
        getResolutionSummary={getResolutionSummary}
        openStreamPlayer={openStreamPlayer}
        runStreamAction={runStreamAction}
        rescanStream={rescanStream}
        precacheStreamHls={precacheStreamHls}
        deleteStream={deleteStream}
        setConnectionsModalStreamId={setConnectionsModalStreamId}
      />
    )}

    <StreamEditModal
      editingStreamId={editingStreamId}
      streamLabel={streams.find((stream) => stream.id === editingStreamId)?.name ?? "Stream details"}
      onClose={cancelEditStream}
      editingStreamName={editingStreamName}
      setEditingStreamName={setEditingStreamName}
      editingStreamIcon={editingStreamIcon}
      setEditingStreamIcon={setEditingStreamIcon}
      editingStreamEncoding={editingStreamEncoding}
      setEditingStreamEncoding={setEditingStreamEncoding}
      editingStreamShuffle={editingStreamShuffle}
      setEditingStreamShuffle={setEditingStreamShuffle}
      editingStreamRestartOnSave={editingStreamRestartOnSave}
      setEditingStreamRestartOnSave={setEditingStreamRestartOnSave}
      editingStreamPrecacheHls={editingStreamPrecacheHls}
      setEditingStreamPrecacheHls={setEditingStreamPrecacheHls}
      editingStreamStatus={editingStreamStatus}
      setEditingStreamStatus={setEditingStreamStatus}
      editingStreamTab={editingStreamTab}
      setEditingStreamTab={setEditingStreamTab}
      editingStreamArtistQuery={editingStreamArtistQuery}
      setEditingStreamArtistQuery={setEditingStreamArtistQuery}
      filteredEditingStreamArtists={filteredEditingStreamArtists}
      editingStreamArtistIds={editingStreamArtistIds}
      editingStreamArtistLoadingIds={editingStreamArtistLoadingIds}
      toggleEditingStreamArtist={toggleEditingStreamArtist}
      editingStreamTrackQuery={editingStreamTrackQuery}
      setEditingStreamTrackQuery={setEditingStreamTrackQuery}
      editingStreamTrackLoading={editingStreamTrackLoading}
      editingStreamTrackResults={editingStreamTrackResults}
      addEditingStreamTrack={addEditingStreamTrack}
      editingStreamTracks={editingStreamTracks}
      editingStreamSelectedIds={editingStreamSelectedIds}
      handleEditingStreamTrackSelect={handleEditingStreamTrackSelect}
      shuffleEditingStreamTracks={shuffleEditingStreamTracks}
      moveEditingStreamTrack={moveEditingStreamTrack}
      moveEditingStreamTracksToEdge={moveEditingStreamTracksToEdge}
      removeEditingStreamTrack={removeEditingStreamTrack}
      rescanEditingStream={rescanEditingStream}
      isRescanningArtists={editingStreamId !== null && rescanningStreamIds.includes(editingStreamId)}
      saveStreamEdits={saveStreamEdits}
    />

    <StreamConnectionsModal stream={connectionsModalStream} onClose={() => setConnectionsModalStreamId(null)} />

    <StreamPlayerModal
      streamId={playingStreamId}
      stream={streams.find((item) => item.id === playingStreamId) ?? null}
      hlsUrl={playingStreamId ? streamLiveUrl(playingStreamId) : ""}
      notice={streamPlayerNotice}
      setNotice={setStreamPlayerNotice}
      videoRef={streamPlayerRef}
      onClose={closeStreamPlayer}
    />
  </section>
);

