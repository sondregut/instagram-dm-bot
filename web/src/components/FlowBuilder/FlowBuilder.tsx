'use client';

import { useCallback, useState, useRef, DragEvent } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeTypes,
  OnConnect,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import MessageNode from './nodes/MessageNode';
import ConditionNode from './nodes/ConditionNode';
import DelayNode from './nodes/DelayNode';
import ActionNode from './nodes/ActionNode';
import { NodePalette } from './NodePalette';
import { NodeEditor } from './NodeEditor';
import {
  FlowNode,
  FlowEdge,
  FlowNodeType,
  TriggerData,
  MessageData,
  ConditionData,
  DelayData,
  ActionData,
  createDefaultNode,
} from '@/lib/flowTypes';

// Define custom node types
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
};

interface FlowBuilderProps {
  initialNodes?: FlowNode[];
  initialEdges?: FlowEdge[];
  onChange?: (nodes: FlowNode[], edges: FlowEdge[]) => void;
  readOnly?: boolean;
}

export function FlowBuilder({
  initialNodes = [],
  initialEdges = [],
  onChange,
  readOnly = false,
}: FlowBuilderProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

  // Convert our FlowNode format to React Flow format
  const convertToReactFlowNodes = (flowNodes: FlowNode[]): Node[] => {
    return flowNodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        label: node.type,
        triggerData: node.type === 'trigger' ? node.data : undefined,
        messageData: node.type === 'message' ? node.data : undefined,
        conditionData: node.type === 'condition' ? node.data : undefined,
        delayData: node.type === 'delay' ? node.data : undefined,
        actionData: node.type === 'action' ? node.data : undefined,
      },
    }));
  };

  // Convert React Flow format back to our FlowNode format
  const convertFromReactFlowNodes = (rfNodes: Node[]): FlowNode[] => {
    return rfNodes.map((node) => {
      let data: TriggerData | MessageData | ConditionData | DelayData | ActionData;

      switch (node.type) {
        case 'trigger':
          data = (node.data as { triggerData: TriggerData }).triggerData || { triggerType: 'keyword', keywords: [] };
          break;
        case 'message':
          data = (node.data as { messageData: MessageData }).messageData || { messageType: 'text', text: '' };
          break;
        case 'condition':
          data = (node.data as { conditionData: ConditionData }).conditionData || { conditionType: 'has_email' };
          break;
        case 'delay':
          data = (node.data as { delayData: DelayData }).delayData || { delayType: 'minutes', value: 5 };
          break;
        case 'action':
          data = (node.data as { actionData: ActionData }).actionData || { actionType: 'collect_email' };
          break;
        default:
          data = { triggerType: 'keyword', keywords: [] } as TriggerData;
      }

      return {
        id: node.id,
        type: node.type as FlowNodeType,
        position: node.position,
        data,
      };
    });
  };

  const [nodes, setNodes, onNodesChange] = useNodesState(convertToReactFlowNodes(initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Handle edge connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  // Handle node selection
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const flowNode = convertFromReactFlowNodes([node])[0];
    setSelectedNode(flowNode);
  }, []);

  // Handle canvas click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Handle node drag over (for drop target)
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle node drop from palette
  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/reactflow') as FlowNodeType;
      if (!nodeType || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left - 90,
        y: event.clientY - reactFlowBounds.top - 20,
      };

      const newFlowNode = createDefaultNode(nodeType, position);
      const newNode: Node = {
        id: newFlowNode.id,
        type: newFlowNode.type,
        position: newFlowNode.position,
        data: {
          label: newFlowNode.type,
          triggerData: newFlowNode.type === 'trigger' ? newFlowNode.data : undefined,
          messageData: newFlowNode.type === 'message' ? newFlowNode.data : undefined,
          conditionData: newFlowNode.type === 'condition' ? newFlowNode.data : undefined,
          delayData: newFlowNode.type === 'delay' ? newFlowNode.data : undefined,
          actionData: newFlowNode.type === 'action' ? newFlowNode.data : undefined,
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  // Handle node update from editor
  const handleNodeUpdate = useCallback(
    (nodeId: string, data: TriggerData | MessageData | ConditionData | DelayData | ActionData) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) return node;

          return {
            ...node,
            data: {
              ...node.data,
              triggerData: node.type === 'trigger' ? data : (node.data as { triggerData?: TriggerData }).triggerData,
              messageData: node.type === 'message' ? data : (node.data as { messageData?: MessageData }).messageData,
              conditionData: node.type === 'condition' ? data : (node.data as { conditionData?: ConditionData }).conditionData,
              delayData: node.type === 'delay' ? data : (node.data as { delayData?: DelayData }).delayData,
              actionData: node.type === 'action' ? data : (node.data as { actionData?: ActionData }).actionData,
            },
          };
        })
      );

      // Update selected node
      setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, data } : prev));
    },
    [setNodes]
  );

  // Handle node deletion
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  // Notify parent of changes
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      if (onChange) {
        // Use setTimeout to get updated nodes after state change
        setTimeout(() => {
          setNodes((currentNodes) => {
            const flowNodes = convertFromReactFlowNodes(currentNodes);
            setEdges((currentEdges) => {
              onChange(flowNodes, currentEdges as FlowEdge[]);
              return currentEdges;
            });
            return currentNodes;
          });
        }, 0);
      }
    },
    [onNodesChange, onChange, setNodes, setEdges]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      if (onChange) {
        setTimeout(() => {
          setNodes((currentNodes) => {
            const flowNodes = convertFromReactFlowNodes(currentNodes);
            setEdges((currentEdges) => {
              onChange(flowNodes, currentEdges as FlowEdge[]);
              return currentEdges;
            });
            return currentNodes;
          });
        }, 0);
      }
    },
    [onEdgesChange, onChange, setNodes, setEdges]
  );

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Node Palette */}
      {!readOnly && (
        <div className="w-64 border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto">
          <NodePalette />
        </div>
      )}

      {/* Main Canvas */}
      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          deleteKeyCode={readOnly ? null : 'Delete'}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
        >
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case 'trigger':
                  return '#10b981';
                case 'message':
                  return '#3b82f6';
                case 'condition':
                  return '#f59e0b';
                case 'delay':
                  return '#8b5cf6';
                case 'action':
                  return '#ef4444';
                default:
                  return '#6b7280';
              }
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
        </ReactFlow>
      </div>

      {/* Right Sidebar - Node Editor */}
      {!readOnly && (
        <div className="w-80 border-l border-gray-200 bg-white">
          <NodeEditor
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNode(null)}
            onDelete={handleNodeDelete}
          />
        </div>
      )}
    </div>
  );
}
