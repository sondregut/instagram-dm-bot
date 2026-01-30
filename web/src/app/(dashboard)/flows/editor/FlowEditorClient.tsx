'use client';

import { useState, useCallback, useEffect, useRef, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Save, Play, Settings } from 'lucide-react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { cloudFunctions } from '@/lib/firebase';
import { Flow, FlowNode, FlowEdge, FlowInput, FlowNodeType } from '@/lib/flowTypes';
import { useAccount } from '@/components/AccountSelector';
import {
  NodePalette,
  NodeEditor,
  TriggerNode,
  MessageNode,
  ConditionNode,
  DelayNode,
  ActionNode,
} from '@/components/FlowBuilder';

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
};

interface FlowEditorClientProps {
  flowId: string | null;
}

export default function FlowEditorClient({ flowId }: FlowEditorClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedAccount } = useAccount();
  const isNewFlow = !flowId || flowId === 'new';

  const [flowName, setFlowName] = useState('Untitled Flow');
  const [flowDescription, setFlowDescription] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Fetch existing flow
  const { data: flow, isLoading } = useQuery({
    queryKey: ['flow', flowId],
    queryFn: async () => {
      if (isNewFlow) return null;
      const result = await cloudFunctions.getFlow({ id: flowId! });
      return result.data as Flow;
    },
    enabled: !isNewFlow,
  });

  // Load flow data into state
  useEffect(() => {
    if (flow) {
      setFlowName(flow.name);
      setFlowDescription(flow.description || '');

      // Convert FlowNodes to React Flow nodes
      const rfNodes: Node[] = flow.nodes.map((node: FlowNode) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          label: node.type,
          ...node.data,
        },
      }));

      // Convert FlowEdges to React Flow edges
      const rfEdges: Edge[] = flow.edges.map((edge: FlowEdge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        animated: true,
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
    }
  }, [flow, setNodes, setEdges]);

  // Create flow mutation
  const createFlowMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; nodes: FlowNode[]; edges: FlowEdge[] }) => {
      if (!selectedAccount) throw new Error('No account selected');
      const flowInput: FlowInput = {
        ...data,
        accountId: selectedAccount.id,
      };
      const result = await cloudFunctions.createFlow(flowInput);
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      router.push(`/flows/editor?id=${data.id}`);
    },
  });

  // Update flow mutation
  const updateFlowMutation = useMutation({
    mutationFn: async (data: { id: string } & Partial<FlowInput>) => {
      const result = await cloudFunctions.updateFlow(data);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['flow', flowId] });
    },
  });

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    // Convert React Flow Node to FlowNode for the editor
    const flowNode: FlowNode = {
      id: node.id,
      type: node.type as FlowNodeType,
      position: node.position,
      data: node.data as unknown as FlowNode['data'],
    };
    setSelectedNode(flowNode);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, data: FlowNode['data']) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...data,
            },
          };
        }
        return node;
      })
    );
    // Also update selected node if it's the one being edited
    setSelectedNode((prev) => prev && prev.id === nodeId ? { ...prev, data } : prev);
  }, [setNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as FlowNodeType;
      if (!type || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label: type },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const handleSave = async () => {
    // Convert React Flow nodes to FlowNodes
    const flowNodes: FlowNode[] = nodes.map((node) => ({
      id: node.id,
      type: node.type as FlowNode['type'],
      position: node.position,
      data: node.data as unknown as FlowNode['data'],
    }));

    // Convert React Flow edges to FlowEdges
    const flowEdges: FlowEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
    }));

    if (isNewFlow) {
      createFlowMutation.mutate({
        name: flowName,
        description: flowDescription,
        nodes: flowNodes,
        edges: flowEdges,
      });
    } else {
      updateFlowMutation.mutate({
        id: flowId!,
        name: flowName,
        description: flowDescription,
        nodes: flowNodes,
        edges: flowEdges,
      });
    }
  };

  if (!isNewFlow && isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/flows')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="font-semibold text-lg border-none focus:ring-0 w-64"
              placeholder="Flow name..."
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled
            >
              <Play className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={createFlowMutation.isPending || updateFlowMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {createFlowMutation.isPending || updateFlowMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Node Palette */}
          <NodePalette className="w-64 border-r bg-gray-50 p-4" />

          {/* Flow Canvas */}
          <div className="flex-1 relative" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              fitView
              snapToGrid
              snapGrid={[15, 15]}
            >
              <Background gap={15} size={1} />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>

          {/* Node Editor */}
          {selectedNode && (
            <NodeEditor
              node={selectedNode}
              onUpdate={handleNodeUpdate}
              onClose={() => setSelectedNode(null)}
              onDelete={handleDeleteNode}
            />
          )}

          {/* Settings Panel */}
          {showSettings && (
            <div className="w-80 border-l bg-white p-4">
              <h3 className="font-semibold mb-4">Flow Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <Input
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    placeholder="Flow name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={flowDescription}
                    onChange={(e) => setFlowDescription(e.target.value)}
                    placeholder="Describe what this flow does..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
