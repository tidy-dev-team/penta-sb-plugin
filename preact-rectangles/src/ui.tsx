import {
  Button,
  Columns,
  Container,
  Muted,
  render,
  Text,
  TextboxMultiline,
  VerticalSpace,
  LoadingIndicator,
  Dropdown,
  DropdownOption,
} from "@create-figma-plugin/ui";
import { emit, on } from "@create-figma-plugin/utilities";
import { h, JSX, Fragment } from "preact";
import { useCallback, useState, useEffect } from "preact/hooks";

import {
  CloseHandler,
  CreateAvatarHandler,
  AvatarCreatedHandler,
} from "./types";

function Plugin() {
  const [value, setValue] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [componentName, setComponentName] = useState<string>("avatar");

  // Listen for avatar creation completion at the top level
  useEffect(() => {
    return on<AvatarCreatedHandler>("AVATAR_CREATED", () => {
      emit<CloseHandler>("CLOSE");
    });
  }, []);

  const handleInput = useCallback(
    function (event: JSX.TargetedEvent<HTMLTextAreaElement>) {
      const newValue = event.currentTarget.value;
      setValue(newValue);

      // Auto-detect component type from pasted code
      if (newValue.trim()) {
        // Check for Button component (with or without props/space)
        if (/<Button[\s>]/i.test(newValue)) {
          if (componentName !== "button") {
            setComponentName("button");
          }
        }
        // Check for Avatar component (with or without props/space)
        else if (/<Avatar[\s>]/i.test(newValue)) {
          if (componentName !== "avatar") {
            setComponentName("avatar");
          }
        }
      }
    },
    [componentName]
  );

  const handleComponentNameChange = useCallback(function (
    event: JSX.TargetedEvent<HTMLInputElement>
  ) {
    const newValue = event.currentTarget.value;
    setComponentName(newValue);
  },
  []);

  const parseComponentProps = (code: string, componentType: string) => {
    const props: Record<string, any> = {};

    // Create regex based on component type
    // Updated to handle components with no props: <Button>...</Button>
    const componentRegex = new RegExp(
      `<${
        componentType.charAt(0).toUpperCase() + componentType.slice(1)
      }\\s*([\\s\\S]*?)(?:>([\\s\\S]*?)<\\/|\\/>)`,
      "gi"
    );
    const match = componentRegex.exec(code);

    if (!match) {
      return null;
    }

    const propsString = match[1];
    const children = match[2];

    // If there are children (text content), add it to props
    // For buttons, map children to "✏️ label" to match Figma component prop
    if (children && children.trim()) {
      if (componentType === "button") {
        props["✏️ label"] = children.trim();
      } else {
        props.children = children.trim();
      }
    }

    // Parse individual props
    // Handle string props: prop="value" or prop='value'
    const stringPropRegex = /(\w+)=["']([^"']+)["']/g;
    let propMatch;

    while ((propMatch = stringPropRegex.exec(propsString)) !== null) {
      const propName = propMatch[1];
      const propValue = propMatch[2];

      // Map variant to type for buttons
      if (componentType === "button" && propName === "variant") {
        props.type = propValue;
      } else {
        props[propName] = propValue;
      }
    }

    // Handle JSX element props: prop={<Component />}
    const jsxPropRegex = /(\w+)=\{<([^>]+)\s*\/>\}/g;
    while ((propMatch = jsxPropRegex.exec(propsString)) !== null) {
      const propName = propMatch[1];
      const propValue = propMatch[2];

      // For buttons, map iconL/iconR to "icon L"/"icon R" and set to true
      if (componentType === "button") {
        if (propName === "iconL") {
          props["icon L"] = true;
        } else if (propName === "iconR") {
          props["icon R"] = true;
        } else {
          props[propName] = `<${propValue} />`;
        }
      } else {
        props[propName] = `<${propValue} />`;
      }
    }

    // Handle boolean props: prop={true/false} or just prop (true)
    const booleanPropRegex = /(\w+)(?:=\{(true|false)\}|\s|\/|>)/g;
    while ((propMatch = booleanPropRegex.exec(propsString)) !== null) {
      const propName = propMatch[1];
      const propValue = propMatch[2];

      // Skip if already captured by other regex
      if (props[propName]) continue;

      // If no explicit value, it's a truthy boolean prop
      if (!propValue && !props[propName]) {
        props[propName] = true;
      } else if (propValue) {
        props[propName] = propValue === "true";
      }
    }

    // Handle number props: prop={123}
    const numberPropRegex = /(\w+)=\{(\d+)\}/g;
    while ((propMatch = numberPropRegex.exec(propsString)) !== null) {
      props[propMatch[1]] = parseInt(propMatch[2], 10);
    }

    return props;
  };

  const handleCreateComponent = useCallback(
    function () {
      if (!value.trim()) {
        setResult("Please paste Storybook code first");
        return;
      }

      if (!componentName.trim()) {
        setResult("Please select a component type");
        return;
      }

      setIsProcessing(true);
      setResult("");

      try {
        const props = parseComponentProps(value, componentName);

        if (!props) {
          const exampleCode =
            componentName === "avatar"
              ? '<Avatar name="John Doe" size="large" />'
              : '<Button size="m" variant="contained">Button</Button>';

          setResult(
            `No ${
              componentName.charAt(0).toUpperCase() + componentName.slice(1)
            } component found in the pasted code.\n\nMake sure your code includes something like:\n${exampleCode}`
          );
          setIsProcessing(false);
          return;
        }

        console.log("Parsed props:", props);

        // Add default values for buttons if not specified
        if (componentName === "button") {
          if (!props.size) {
            props.size = "m"; // Default to medium size
          }
          if (!props.type) {
            props.type = "contained"; // Default to contained variant
          }
        }

        // Send props and component name to main thread
        emit<CreateAvatarHandler>("CREATE_AVATAR", {
          props,
          componentName,
        });

        setResult(
          `${componentName} will be created with props:\n\n${JSON.stringify(
            props,
            null,
            2
          )}\n\nCheck your Figma canvas!`
        );
        setIsProcessing(false);
      } catch (error) {
        setResult(
          `Error parsing ${componentName} props: ` + (error as Error).message
        );
        setIsProcessing(false);
      }

      // Plugin will auto-close when main thread emits "AVATAR_CREATED"
    },
    [value, componentName]
  );

  const handleCloseButtonClick = useCallback(function () {
    emit<CloseHandler>("CLOSE");
  }, []);

  const componentOptions: Array<DropdownOption> = [
    { value: "avatar", text: "Avatar" },
    { value: "button", text: "Button" },
  ];

  const placeholderText =
    componentName === "avatar"
      ? `Paste your Storybook code here...\n\nExample:\n<Avatar\n  name="John Doe"\n  size="large"\n  variant="circle"\n  showStatus={true}\n/>`
      : `Paste your Storybook code here...\n\nExample:\n<Button\n  iconL={<Plus />}\n  iconR={<ArrowRight />}\n  size="m"\n  variant="contained"\n>\n  Button\n</Button>`;

  return (
    <Container space="medium">
      <VerticalSpace space="large" />
      <Text>
        <Muted>Figma Component Name</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Dropdown
        onChange={handleComponentNameChange}
        options={componentOptions}
        value={componentName}
      />
      <VerticalSpace space="medium" />
      <Text>
        <Muted>
          Paste Storybook{" "}
          {componentName.charAt(0).toUpperCase() + componentName.slice(1)}{" "}
          Implementation
        </Muted>
      </Text>
      <VerticalSpace space="small" />
      <TextboxMultiline
        onInput={handleInput}
        value={value}
        rows={10}
        placeholder={placeholderText}
      />
      <VerticalSpace space="medium" />
      <Button fullWidth onClick={handleCreateComponent} disabled={isProcessing}>
        {isProcessing ? "Building..." : "Build on Canvas"}
      </Button>
      {isProcessing && (
        <Fragment>
          <VerticalSpace space="small" />
          <LoadingIndicator />
        </Fragment>
      )}
      {result && (
        <Fragment>
          <VerticalSpace space="medium" />
          <Text>
            <Muted>Result:</Muted>
          </Text>
          <VerticalSpace space="small" />
          <TextboxMultiline value={result} rows={8} disabled />
        </Fragment>
      )}
      <VerticalSpace space="extraLarge" />
      <Columns space="extraSmall">
        <Button fullWidth onClick={handleCloseButtonClick} secondary>
          Close
        </Button>
      </Columns>
      <VerticalSpace space="small" />
    </Container>
  );
}

export default render(Plugin);
